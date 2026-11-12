"""
Policy approval by member signatures.

Lifecycle:
  DRAFT      Treasurer creates and edits the policy.
  FINALIZED  "Open for signing" for POLICY_SIGNING_DAYS (1 week): the
             Treasurer opened it (and signed). Every member signs (approves) or
             rejects with a reason, and can change their decision until the
             deadline. Everyone can see everyone's decision.
  At the deadline (hourly Celery job, or lazily when viewed):
  ACTIVE     every required signer had approved, or
  VOID       it lapsed (someone rejected or didn't sign).
  The Treasurer can withdraw an open policy, or revise a lapsed one, back to
  DRAFT; that clears all signatures and the deadline.

Required signers are a snapshot, taken when the policy is opened, of every
active account holding a cooperative role (member, secretary, treasurer,
president). System admin accounts never sign: admin is an extra access role
(the person signs from their member account). Signers who are later disabled
no longer count.

When a policy is adopted, its adoption record (PDF on letterhead, with a
reference number and the list of members who approved it) is generated; see
services/policy_document.py.

Proxy signing (extreme cases only): an Admin, after consulting an absent
member (e.g. by phone), files a proxy request. It is applied only once the
President, Treasurer and Secretary have each authorised it. Neither the absent
member nor the requesting Admin can authorise their own request.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.models.notification_model import NotificationType
from app.models.policy.base_policy import PolicyStatus
from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.loan_policy import LoanPolicy
from app.models.policy.policy_signature import (
    PolicyProxyAuthorisation,
    PolicyProxyRequest,
    PolicySignature,
    ProxyRequestStatus,
    SignatureStatus,
)
from app.models.user_model import AccessRole, CooperativeRole, User
from app.schemas.policy.policy_signing_schema import (
    ProxyAuthorisationOut,
    ProxyRequestOut,
    PolicyTermOut,
    SignatureOut,
    SigningSummary,
)
from app.services.duties import coop_roles, is_active_member, is_system_admin
from app.services import policy_document
from app.services.notify import notify
from app import i18n
from app.services.signature_image import delete_signature, save_signature

POLICY_MODELS = {"deposit": DepositPolicy, "loan": LoanPolicy}
AUTHORISER_ROLES = [
    CooperativeRole.PRESIDENT.value,
    CooperativeRole.TREASURER.value,
    CooperativeRole.SECRETARY.value,
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def full_name(user: Optional[User]) -> str:
    if not user:
        return "Unknown"
    return f"{user.first_name} {user.last_name}".strip()


def is_admin(user: User) -> bool:
    return AccessRole.ADMIN.value in {
        str(getattr(r, "value", r)).lower() for r in (user.access_roles or [])
    }


def label_both(policy_type: str, policy) -> dict:
    """The policy label in English and Nepali, for notifications."""
    en = policy_label(policy_type, policy)
    return i18n.both(en, i18n._label_ne(en))


def policy_label(policy_type: str, policy) -> str:
    if policy_type == "deposit":
        amount = float(policy.amount_paisa) / 100
        return f"Deposit policy (Rs. {amount:,.2f}, {policy.schedule_type.value.replace('_', ' ')})"
    return (
        f"Loan policy (Rs. {float(policy.min_loan_amount):,.0f}–{float(policy.max_loan_amount):,.0f}, "
        f"{policy.interest_rate}%)"
    )


class PolicySigningService:
    # ------------------------------------------------------------------
    # Lookups
    # ------------------------------------------------------------------
    @staticmethod
    def get_policy(session: Session, policy_type: str, policy_id: uuid.UUID):
        model = POLICY_MODELS.get(policy_type)
        if model is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown policy type.")
        policy = session.exec(select(model).where(model.policy_id == policy_id)).first()
        if not policy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found.")
        return policy

    @staticmethod
    def signer_pool(session: Session) -> list[User]:
        """Every active (enabled, verified, approved) account holding a cooperative
        role, except system admin accounts."""
        return [
            u for u in session.exec(select(User)).all()
            if is_active_member(u) and coop_roles(u) and not is_system_admin(u)
        ]

    @staticmethod
    def _is_signer(user: Optional[User]) -> bool:
        """Rows of system admin accounts (from policies opened before they were
        excluded) are ignored."""
        return user is not None and not is_system_admin(user)

    @staticmethod
    def _signatures(session: Session, policy_type: str, policy_id: uuid.UUID) -> list[PolicySignature]:
        return list(
            session.exec(
                select(PolicySignature).where(
                    PolicySignature.policy_type == policy_type,
                    PolicySignature.policy_id == policy_id,
                )
            ).all()
        )

    @staticmethod
    def _deadline_passed(policy) -> bool:
        deadline = policy.signing_deadline
        if deadline is None:
            return False
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return deadline <= _now()

    def _require_open(self, policy) -> None:
        if policy.status != PolicyStatus.FINALIZED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This policy is not open for signing. Current status: {policy.status.value}",
            )
        if self._deadline_passed(policy):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The signing deadline for this policy has passed.",
            )

    # ------------------------------------------------------------------
    # Notifications
    # ------------------------------------------------------------------
    @staticmethod
    def _notify(
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        users: list[User],
        key: str,
        ntype: NotificationType,
        policy_type: str,
        policy_id: uuid.UUID,
        **args,
    ) -> None:
        """In-app notification + email, in each reader's language (app/i18n.py)."""
        notify(session, background_tasks, users, key, ntype, policy_type=policy_type, policy_id=policy_id, **args)

    # ------------------------------------------------------------------
    # Treasurer: open / withdraw
    # ------------------------------------------------------------------
    def open_for_signing(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        policy_type: str,
        policy_id: uuid.UUID,
        treasurer: User,
        signature_image: Optional[str] = None,
    ):
        policy = self.get_policy(session, policy_type, policy_id)
        if policy.status != PolicyStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only draft policies can be opened for signing. Current status: {policy.status.value}",
            )

        self._delete_rows(session, self._signatures(session, policy_type, policy_id))
        session.flush()
        sig_key, sig_sha = save_signature(signature_image) if signature_image else (None, None)

        now = _now()
        signers = self.signer_pool(session)
        for user in signers:
            is_treasurer = user.id == treasurer.id
            session.add(
                PolicySignature(
                    policy_type=policy_type,
                    policy_id=policy_id,
                    user_id=user.id,
                    # The Treasurer signs when opening the policy
                    status=SignatureStatus.APPROVED if is_treasurer else SignatureStatus.PENDING,
                    signer_name=full_name(user) if is_treasurer else None,
                    signed_at=now if is_treasurer else None,
                    signature_file_key=sig_key if is_treasurer else None,
                    signature_sha256=sig_sha if is_treasurer else None,
                )
            )

        policy.status = PolicyStatus.FINALIZED
        policy.signing_deadline = now + timedelta(days=settings.POLICY_SIGNING_DAYS)
        policy.updated_by = treasurer.email
        policy.updated_at = now
        session.add(policy)

        self._notify(
            session,
            background_tasks,
            [u for u in signers if u.id != treasurer.id],
            "policy_open_for_signing",
            NotificationType.POLICY_APPROVAL,
            policy_type,
            policy_id,
            treasurer=full_name(treasurer),
            label=label_both(policy_type, policy),
            deadline=policy.signing_deadline,
        )
        session.commit()
        session.refresh(policy)
        return policy

    def withdraw(self, session: Session, policy_type: str, policy_id: uuid.UUID, treasurer: User):
        """Back to DRAFT for revision (an open policy, or one that lapsed);
        clears signatures, the deadline and pending proxies."""
        policy = self.get_policy(session, policy_type, policy_id)
        self.close_if_due(session, None, policy_type, policy)
        if policy.status not in (PolicyStatus.FINALIZED, PolicyStatus.VOID):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only open or lapsed policies can be revised. Current status: {policy.status.value}",
            )

        self._delete_rows(session, self._signatures(session, policy_type, policy_id))
        session.flush()
        for req in self._proxy_requests(session, policy_type, policy_id, ProxyRequestStatus.PENDING):
            req.status = ProxyRequestStatus.CANCELLED
            req.resolved_at = _now()
            session.add(req)

        policy.status = PolicyStatus.DRAFT
        policy.signing_deadline = None
        policy.updated_by = treasurer.email
        policy.updated_at = _now()
        session.add(policy)
        session.commit()
        session.refresh(policy)
        return policy

    # ------------------------------------------------------------------
    # Members: sign / reject
    # ------------------------------------------------------------------
    def sign(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        policy_type: str,
        policy_id: uuid.UUID,
        user: User,
        decision: SignatureStatus,
        reason: Optional[str],
        signature_image: Optional[str] = None,
    ) -> SigningSummary:
        policy = self.get_policy(session, policy_type, policy_id)
        self._require_open(policy)
        if decision == SignatureStatus.PENDING:
            raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'.")
        if decision == SignatureStatus.REJECTED and not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Please give a reason for rejecting.")

        row = next(
            (s for s in self._signatures(session, policy_type, policy_id) if s.user_id == user.id),
            None,
        )
        if is_system_admin(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System admin accounts don't sign policies. Please sign from your member account.",
            )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not one of the required signers for this policy.",
            )

        # Hand signature (validated before anything changes)
        new_signature = save_signature(signature_image) if decision == SignatureStatus.APPROVED and signature_image else None
        self._record(row, user, decision, reason, proxy_request_id=None)
        if new_signature:
            delete_signature(row.signature_file_key)
            row.signature_file_key, row.signature_sha256 = new_signature
        session.add(row)

        if decision == SignatureStatus.REJECTED:
            creator = self._creator(session, policy)
            if creator:
                self._notify(
                    session,
                    background_tasks,
                    [creator],
                    "policy_rejected_by_member",
                    NotificationType.POLICY_REJECTED,
                    policy_type,
                    policy_id,
                    member=full_name(user),
                    label=label_both(policy_type, policy),
                    reason=reason,
                )
        session.commit()
        return self.summary(session, policy_type, policy_id, user)

    @staticmethod
    def _delete_rows(session: Session, rows: list[PolicySignature]) -> None:
        """Delete signature rows and their hand-signature images."""
        for row in rows:
            delete_signature(row.signature_file_key)
            session.delete(row)

    @staticmethod
    def _record(row: PolicySignature, user: User, decision, reason, proxy_request_id) -> None:
        row.status = decision
        row.signer_name = full_name(user)
        row.signed_at = _now()
        row.reason = (reason or "").strip() or None
        row.proxy_request_id = proxy_request_id
        if decision != SignatureStatus.APPROVED:
            # A rejection carries no hand signature
            delete_signature(row.signature_file_key)
            row.signature_file_key = row.signature_sha256 = None

    @staticmethod
    def _creator(session: Session, policy) -> Optional[User]:
        if not policy.created_by:
            return None
        return session.exec(select(User).where(User.email == policy.created_by)).first()

    # ------------------------------------------------------------------
    # Activation
    # ------------------------------------------------------------------
    def close_if_due(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        policy_type: str,
        policy,
    ) -> bool:
        """At the deadline: ACTIVE if every (still active) required signer
        approved, otherwise VOID (lapsed). Returns True if it closed."""
        if policy.status != PolicyStatus.FINALIZED or not self._deadline_passed(policy):
            return False
        rows = self._signatures(session, policy_type, policy.policy_id)
        counted = [
            r for r in rows
            if (u := session.get(User, r.user_id)) and not u.disabled and self._is_signer(u)
        ]
        adopted = bool(counted) and all(r.status == SignatureStatus.APPROVED for r in counted)

        policy.status = PolicyStatus.ACTIVE if adopted else PolicyStatus.VOID
        policy.updated_at = _now()
        session.add(policy)
        for req in self._proxy_requests(session, policy_type, policy.policy_id, ProxyRequestStatus.PENDING):
            req.status = ProxyRequestStatus.CANCELLED
            req.resolved_at = _now()
            session.add(req)

        if adopted:
            key, ntype = "policy_adopted", NotificationType.POLICY_APPROVED
            args = {"label": label_both(policy_type, policy)}
        else:
            missing = sum(r.status == SignatureStatus.PENDING for r in counted)
            rejected = sum(r.status == SignatureStatus.REJECTED for r in counted)
            key, ntype = "policy_not_adopted", NotificationType.POLICY_REJECTED
            args = {"label": label_both(policy_type, policy), "rejected": rejected, "missing": missing}
        self._notify(
            session, background_tasks,
            [u for r in counted if (u := session.get(User, r.user_id))],
            key, ntype, policy_type, policy.policy_id, **args,
        )
        session.commit()
        if adopted:
            policy_document.try_create_record(session, policy_type, policy)
        return True

    def close_due_policies(self, session: Session, background_tasks: Optional[BackgroundTasks] = None) -> int:
        """Close every open policy whose deadline has passed (hourly job)."""
        closed = 0
        for policy_type, model in POLICY_MODELS.items():
            for policy in session.exec(select(model).where(model.status == PolicyStatus.FINALIZED)).all():
                closed += self.close_if_due(session, background_tasks, policy_type, policy)
        return closed

    # ------------------------------------------------------------------
    # Read model
    # ------------------------------------------------------------------
    def summary(
        self, session: Session, policy_type: str, policy_id: uuid.UUID, viewer: Optional[User] = None
    ) -> SigningSummary:
        policy = self.get_policy(session, policy_type, policy_id)
        self.close_if_due(session, None, policy_type, policy)
        rows = self._signatures(session, policy_type, policy_id)
        out: list[SignatureOut] = []
        for r in rows:
            user = session.get(User, r.user_id)
            if not self._is_signer(user) and user is not None:
                continue
            proxy = session.get(PolicyProxyRequest, r.proxy_request_id) if r.proxy_request_id else None
            out.append(
                SignatureOut(
                    user_id=r.user_id,
                    name=r.signer_name or full_name(user),
                    roles=sorted(coop_roles(user)),
                    status=r.status,
                    signed_at=r.signed_at,
                    reason=r.reason,
                    counted=bool(user and not user.disabled),
                    has_signature_image=bool(r.signature_file_key),
                    proxy=self._proxy_out(session, proxy, viewer) if proxy else None,
                )
            )
        out.sort(key=lambda s: (s.status != SignatureStatus.APPROVED, s.name.lower()))
        counted = [s for s in out if s.counted]
        record = policy_document.get_record(session, policy_type, policy_id)
        mine = next((s for s in out if viewer and s.user_id == viewer.id), None)
        return SigningSummary(
            policy_type=policy_type,
            policy_id=policy_id,
            label=policy_label(policy_type, policy),
            title=policy_document.policy_title(policy_type, policy),
            statement=policy_document.statement_en(policy_type, policy),
            statement_ne=policy_document.statement_ne(policy_type, policy),
            statement_custom=bool(
                policy_document._custom(policy.statement_en) or policy_document._custom(policy.statement_ne)
            ),
            terms=[PolicyTermOut(label=k, value=v) for k, v in policy_document.policy_terms(policy_type, policy)],
            record_available=policy.status in policy_document.ADOPTED_STATUSES,
            preview_available=policy.status == PolicyStatus.FINALIZED and not self._deadline_passed(policy),
            record_reference=record.reference if record else None,
            status=policy.status,
            signing_deadline=policy.signing_deadline,
            deadline_passed=self._deadline_passed(policy),
            required=len(counted),
            approved=sum(s.status == SignatureStatus.APPROVED for s in counted),
            rejected=sum(s.status == SignatureStatus.REJECTED for s in counted),
            pending=sum(s.status == SignatureStatus.PENDING for s in counted),
            my_status=mine.status if mine else None,
            signatures=out,
        )

    # ------------------------------------------------------------------
    # Proxy signing (Admin, authorised by President + Treasurer + Secretary)
    # ------------------------------------------------------------------
    @staticmethod
    def _proxy_requests(session, policy_type, policy_id, status_filter=None) -> list[PolicyProxyRequest]:
        stmt = select(PolicyProxyRequest).where(
            PolicyProxyRequest.policy_type == policy_type,
            PolicyProxyRequest.policy_id == policy_id,
        )
        if status_filter is not None:
            stmt = stmt.where(PolicyProxyRequest.status == status_filter)
        return list(session.exec(stmt).all())

    @staticmethod
    def authoriser_plan(session: Session, absentee_id: uuid.UUID, requester_id: uuid.UUID) -> dict[str, list[User]]:
        """For each office role, the people who may authorise on its behalf
        (excluding the absent member and the requesting Admin)."""
        users = [u for u in session.exec(select(User)).all() if is_active_member(u)]
        plan: dict[str, list[User]] = {}
        for role in AUTHORISER_ROLES:
            holders = [
                u for u in users
                if role in coop_roles(u) and u.id not in (absentee_id, requester_id)
            ]
            if holders:
                plan[role] = holders
        return plan

    def create_proxy_request(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        policy_type: str,
        policy_id: uuid.UUID,
        admin: User,
        signer_user_id: uuid.UUID,
        decision: SignatureStatus,
        reason: Optional[str],
        consultation_note: str,
    ) -> ProxyRequestOut:
        if not is_admin(admin):
            raise HTTPException(status_code=403, detail="Only an Admin can request to sign on a member's behalf.")
        policy = self.get_policy(session, policy_type, policy_id)
        self._require_open(policy)
        if signer_user_id == admin.id:
            raise HTTPException(status_code=400, detail="Sign your own policy directly, not by proxy.")
        if decision == SignatureStatus.PENDING:
            raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'.")
        if decision == SignatureStatus.REJECTED and not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Give the member's reason for rejecting.")
        if not consultation_note.strip():
            raise HTTPException(status_code=400, detail="Describe how the member was consulted.")

        row = next(
            (s for s in self._signatures(session, policy_type, policy_id) if s.user_id == signer_user_id),
            None,
        )
        signer = session.get(User, signer_user_id)
        if row is None or signer is None or signer.disabled or not self._is_signer(signer):
            raise HTTPException(status_code=400, detail="That member is not a required signer of this policy.")
        if any(
            r.signer_user_id == signer_user_id
            for r in self._proxy_requests(session, policy_type, policy_id, ProxyRequestStatus.PENDING)
        ):
            raise HTTPException(status_code=400, detail="There is already a pending proxy request for this member.")

        plan = self.authoriser_plan(session, signer_user_id, admin.id)
        if len({u.id for holders in plan.values() for u in holders}) < 2:
            raise HTTPException(
                status_code=400,
                detail="Not enough independent office bearers to authorise this proxy (need at least two).",
            )

        req = PolicyProxyRequest(
            policy_type=policy_type,
            policy_id=policy_id,
            signer_user_id=signer_user_id,
            requested_by=admin.id,
            decision=decision,
            reason=(reason or "").strip() or None,
            consultation_note=consultation_note.strip(),
        )
        session.add(req)
        authorisers = {u.id: u for holders in plan.values() for u in holders}
        self._notify(
            session,
            background_tasks,
            list(authorisers.values()),
            "proxy_request",
            NotificationType.POLICY_APPROVAL,
            policy_type,
            policy_id,
            admin=full_name(admin),
            verb=i18n.both("approve", "स्वीकृत") if decision == SignatureStatus.APPROVED else i18n.both("reject", "अस्वीकृत"),
            label=label_both(policy_type, policy),
            signer=full_name(signer),
            note=req.consultation_note,
        )
        session.commit()
        session.refresh(req)
        return self._proxy_out(session, req, admin)

    def authorise_proxy(
        self,
        session: Session,
        background_tasks: Optional[BackgroundTasks],
        request_id: uuid.UUID,
        user: User,
        approve: bool,
        note: Optional[str],
    ) -> ProxyRequestOut:
        req = session.get(PolicyProxyRequest, request_id)
        if not req:
            raise HTTPException(status_code=404, detail="Proxy request not found.")
        # A policy whose deadline passed is closed first (cancels its proxies)
        self.close_if_due(
            session, background_tasks, req.policy_type,
            self.get_policy(session, req.policy_type, req.policy_id),
        )
        session.refresh(req)
        if req.status != ProxyRequestStatus.PENDING:
            raise HTTPException(status_code=400, detail=f"This request is already {req.status.value}.")

        plan = self.authoriser_plan(session, req.signer_user_id, req.requested_by)
        if not any(user.id == u.id for holders in plan.values() for u in holders):
            raise HTTPException(
                status_code=403,
                detail="Only the President, Treasurer or Secretary (not the absent member or the requesting Admin) can authorise this.",
            )
        existing = session.exec(
            select(PolicyProxyAuthorisation).where(
                PolicyProxyAuthorisation.request_id == req.id,
                PolicyProxyAuthorisation.user_id == user.id,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="You have already responded to this request.")

        session.add(
            PolicyProxyAuthorisation(
                request_id=req.id, user_id=user.id, approved=approve, note=(note or "").strip() or None
            )
        )
        session.flush()

        policy = self.get_policy(session, req.policy_type, req.policy_id)
        admin = session.get(User, req.requested_by)
        signer = session.get(User, req.signer_user_id)

        if not approve:
            req.status = ProxyRequestStatus.DECLINED
            req.resolved_at = _now()
            session.add(req)
            if admin:
                self._notify(
                    session, background_tasks, [admin], "proxy_declined",
                    NotificationType.GENERAL, req.policy_type, req.policy_id,
                    member=full_name(user), label=label_both(req.policy_type, policy), signer=full_name(signer),
                )
            session.commit()
            return self._proxy_out(session, req, user)

        if self._fully_authorised(session, req, plan):
            self._require_open(policy)
            row = next(
                (s for s in self._signatures(session, req.policy_type, req.policy_id)
                 if s.user_id == req.signer_user_id),
                None,
            )
            if row is None or signer is None:
                raise HTTPException(status_code=400, detail="The member is no longer a required signer.")
            self._record(row, signer, req.decision, req.reason, proxy_request_id=req.id)
            session.add(row)
            req.status = ProxyRequestStatus.APPLIED
            req.resolved_at = _now()
            session.add(req)
            self._notify(
                session, background_tasks, [signer], "proxy_applied",
                NotificationType.GENERAL, req.policy_type, req.policy_id,
                admin=full_name(admin),
                verb=i18n.both("approved", "स्वीकृत") if req.decision == SignatureStatus.APPROVED
                else i18n.both("rejected", "अस्वीकृत"),
                label=label_both(req.policy_type, policy),
                note=req.consultation_note,
            )
            session.commit()
        else:
            session.commit()
        session.refresh(req)
        return self._proxy_out(session, req, user)

    @staticmethod
    def _fully_authorised(session: Session, req: PolicyProxyRequest, plan: dict[str, list[User]]) -> bool:
        approvals = session.exec(
            select(PolicyProxyAuthorisation).where(
                PolicyProxyAuthorisation.request_id == req.id,
                PolicyProxyAuthorisation.approved == True,  # noqa: E712
            )
        ).all()
        approver_ids = {a.user_id for a in approvals}
        every_role = all(any(u.id in approver_ids for u in holders) for holders in plan.values())
        eligible = {u.id for holders in plan.values() for u in holders}
        return every_role and len(approver_ids & eligible) >= min(2, len(eligible))

    def cancel_proxy(self, session: Session, request_id: uuid.UUID, admin: User) -> ProxyRequestOut:
        req = session.get(PolicyProxyRequest, request_id)
        if not req:
            raise HTTPException(status_code=404, detail="Proxy request not found.")
        if not is_admin(admin):
            raise HTTPException(status_code=403, detail="Only an Admin can cancel proxy requests.")
        if req.status != ProxyRequestStatus.PENDING:
            raise HTTPException(status_code=400, detail=f"This request is already {req.status.value}.")
        req.status = ProxyRequestStatus.CANCELLED
        req.resolved_at = _now()
        session.add(req)
        session.commit()
        session.refresh(req)
        return self._proxy_out(session, req, admin)

    def list_proxy_requests(
        self, session: Session, viewer: User, status_filter: Optional[ProxyRequestStatus] = None
    ) -> list[ProxyRequestOut]:
        if not (is_admin(viewer) or coop_roles(viewer) & set(AUTHORISER_ROLES)):
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        stmt = select(PolicyProxyRequest).order_by(PolicyProxyRequest.created_at.desc())
        if status_filter is not None:
            stmt = stmt.where(PolicyProxyRequest.status == status_filter)
        return [self._proxy_out(session, r, viewer) for r in session.exec(stmt).all()]

    def _proxy_out(self, session: Session, req: PolicyProxyRequest, viewer: Optional[User]) -> ProxyRequestOut:
        plan = self.authoriser_plan(session, req.signer_user_id, req.requested_by)
        auths = session.exec(
            select(PolicyProxyAuthorisation).where(PolicyProxyAuthorisation.request_id == req.id)
        ).all()
        responded = {a.user_id for a in auths}
        eligible_ids = {u.id for holders in plan.values() for u in holders}
        try:
            label = policy_label(req.policy_type, self.get_policy(session, req.policy_type, req.policy_id))
        except HTTPException:
            label = f"{req.policy_type.title()} policy"
        return ProxyRequestOut(
            id=req.id,
            policy_type=req.policy_type,
            policy_id=req.policy_id,
            policy_label=label,
            signer_user_id=req.signer_user_id,
            signer_name=full_name(session.get(User, req.signer_user_id)),
            requested_by_name=full_name(session.get(User, req.requested_by)),
            decision=req.decision,
            reason=req.reason,
            consultation_note=req.consultation_note,
            status=req.status,
            created_at=req.created_at,
            resolved_at=req.resolved_at,
            required_roles=list(plan.keys()),
            authorisations=[
                ProxyAuthorisationOut(
                    name=full_name(session.get(User, a.user_id)),
                    roles=sorted(coop_roles(session.get(User, a.user_id)) & set(AUTHORISER_ROLES)),
                    approved=a.approved,
                    note=a.note,
                    at=a.created_at,
                )
                for a in auths
            ],
            can_authorise=bool(
                viewer
                and req.status == ProxyRequestStatus.PENDING
                and viewer.id in eligible_ids
                and viewer.id not in responded
            ),
        )
