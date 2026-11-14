"""
Meeting minutes: written by the Secretary (the Admin stands in when the
Secretary is absent; nobody else writes them),
submitted, approved by the President (the Secretary when the President wrote
them; nobody approves their own). Approved minutes are locked, numbered
(YUG/MM/<year>/<NNNN>) and kept as a PDF; members see only approved minutes,
office bearers also see drafts.

Votes: a resolution passes by simple majority of those voting (for > against);
"unanimous" when nobody voted against or abstained.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.document_storage import document_storage
from app.models.calendar_model import CalendarEvent, EventRsvp
from app.models.meeting_minutes_model import (
    MeetingMinutes,
    MinutesSignature,
    MinutesSignatureStatus,
    MinutesStatus,
)
from app.models.notification_model import NotificationType
from app.models.user_model import User
from app.schemas.meeting_minutes_schema import (
    AgendaItemOut,
    Attendee,
    MinutesIn,
    MinutesList,
    MinutesOut,
    MinutesSummary,
    Prefill,
    ResolutionOut,
    ReturnIn,
    SignatureOut,
    VoteOut,
)
from app.services.duties import (
    Duty,
    can_be_guarantor,
    coop_roles,
    denial_reason,
    is_admin_standin,
    is_active_member,
    is_office_bearer,
    name_with_role,
    require_duty,
    responsible_users,
)
from app.services.notify import notify
from app.services.signature_image import delete_signature, save_signature

# Minutes every member may read (approved, whether or not fully signed)
OFFICIAL = (MinutesStatus.APPROVED.value, MinutesStatus.SIGNED.value)
from app.utils.local_time import to_local


def vote_out(vote: Optional[dict]) -> Optional[VoteOut]:
    if not vote:
        return None
    f, a, ab = vote.get("votes_for", 0), vote.get("votes_against", 0), vote.get("abstained", 0)
    return VoteOut(category=vote.get("category", "other"), votes_for=f, votes_against=a, abstained=ab,
                   result="passed" if f > a else "not_passed", unanimous=f > 0 and a == 0 and ab == 0)


def _members(session: Session) -> list[User]:
    return [u for u in session.exec(select(User)).all() if can_be_guarantor(u)]


def _require_member(user: User) -> None:
    if not (is_active_member(user) and (user.cooperative_roles or is_admin_standin(user))):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Meeting minutes are only available to members.")


def can_write(user: User) -> bool:
    """The Secretary writes the minutes; the Admin stands in when they're absent."""
    return is_active_member(user) and ("secretary" in coop_roles(user) or is_admin_standin(user))


def sees_drafts(user: User) -> bool:
    return is_office_bearer(user) or is_admin_standin(user)


def _require_writer(user: User) -> None:
    _require_member(user)
    if not can_write(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only the Secretary (or the Admin, standing in) can write meeting minutes.")


class MinutesService:
    # ----------------------------------------------------------- reading
    def _visible(self, session: Session, user: User, minutes_id: uuid.UUID) -> MeetingMinutes:
        _require_member(user)
        m = session.get(MeetingMinutes, minutes_id)
        if m is None or (m.status not in OFFICIAL and not sees_drafts(user)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Minutes not found.")
        return m

    def can_review(self, session: Session, user: User, m: MeetingMinutes) -> bool:
        return (
            m.status == MinutesStatus.SUBMITTED.value
            and denial_reason(user, Duty.APPROVE_MINUTES, session.get(User, m.recorded_by)) is None
        )

    def to_out(self, session: Session, user: User, m: MeetingMinutes) -> MinutesOut:
        ids = [uuid.UUID(str(i)) for i in m.attendee_ids or []]
        users = {u.id: u for u in session.exec(select(User).where(User.id.in_(ids))).all()} if ids else {}
        attendees = [Attendee(id=i, name=f"{users[i].first_name} {users[i].last_name}".strip()) for i in ids if i in users]
        attendees.sort(key=lambda a: a.name.lower())
        sig_rows = self._signatures(session, m.id)
        names = {a.id: a.name for a in attendees}
        signatures = [
            SignatureOut(user_id=r.user_id, name=r.signer_name or names.get(r.user_id, "-"), status=r.status,
                         signed_at=r.signed_at, has_image=bool(r.signature_file_key), note=r.note)
            for r in sig_rows
        ]
        mine = next((r for r in sig_rows if r.user_id == user.id), None)
        return MinutesOut(
            id=m.id, title=m.title, meeting_type=m.meeting_type, held_at=m.held_at, location=m.location,
            event_id=m.event_id, chaired_by=m.chaired_by, recorded_by_name=m.recorded_by_name, attendees=attendees,
            guests=m.guests, members_total=m.members_total,
            agenda=[AgendaItemOut(title=i.get("title", ""), discussion=i.get("discussion"), decision=i.get("decision"),
                                  vote=vote_out(i.get("vote"))) for i in m.agenda or []],
            other_business=m.other_business, status=m.status, submitted_at=m.submitted_at,
            reviewed_by_name=m.reviewed_by_name, reviewed_at=m.reviewed_at, return_note=m.return_note,
            reference=m.reference, created_at=m.created_at, updated_at=m.updated_at,
            can_edit=m.status == MinutesStatus.DRAFT.value and can_write(user),
            can_review=self.can_review(session, user, m),
            has_pdf=bool(m.file_key),
            signatures=signatures,
            signed_count=sum(1 for r in sig_rows if r.status == MinutesSignatureStatus.SIGNED.value),
            my_signature=mine.status if mine else None,
            can_sign=bool(mine) and m.status == MinutesStatus.APPROVED.value
            and mine.status != MinutesSignatureStatus.SIGNED.value,
        )

    @staticmethod
    def _signatures(session: Session, minutes_id) -> list[MinutesSignature]:
        rows = session.exec(select(MinutesSignature).where(MinutesSignature.minutes_id == minutes_id)).all()
        order = {MinutesSignatureStatus.SIGNED.value: 0, MinutesSignatureStatus.DECLINED.value: 1}
        return sorted(rows, key=lambda r: (order.get(r.status, 2), r.signed_at or datetime.max.replace(tzinfo=timezone.utc),
                                           (r.signer_name or "").lower()))

    def list(self, session: Session, user: User) -> MinutesList:
        _require_member(user)
        q = select(MeetingMinutes)
        if not sees_drafts(user):
            q = q.where(MeetingMinutes.status.in_(OFFICIAL))
        rows = session.exec(q.order_by(MeetingMinutes.held_at.desc())).all()
        sigs: dict = {}
        if rows:
            for r in session.exec(select(MinutesSignature).where(MinutesSignature.minutes_id.in_([m.id for m in rows]))).all():
                sigs.setdefault(r.minutes_id, []).append(r)
        items = []
        for m in rows:
            votes = [vote_out(i.get("vote")) for i in m.agenda or [] if i.get("vote")]
            items.append(MinutesSummary(
                id=m.id, title=m.title, meeting_type=m.meeting_type, held_at=m.held_at, status=m.status,
                reference=m.reference, present=len(m.attendee_ids or []), members_total=m.members_total,
                resolutions=len(votes), passed=sum(1 for v in votes if v.result == "passed"),
                recorded_by_name=m.recorded_by_name, can_review=self.can_review(session, user, m),
                signed_count=sum(1 for r in sigs.get(m.id, []) if r.status == MinutesSignatureStatus.SIGNED.value),
                needs_my_signature=m.status == MinutesStatus.APPROVED.value and any(
                    r.user_id == user.id and r.status != MinutesSignatureStatus.SIGNED.value for r in sigs.get(m.id, [])),
            ))
        return MinutesList(items=items, can_write=can_write(user))

    def get(self, session: Session, user: User, minutes_id: uuid.UUID) -> MinutesOut:
        return self.to_out(session, user, self._visible(session, user, minutes_id))

    def resolutions(self, session: Session, user: User) -> list[ResolutionOut]:
        """Every resolution put to a vote in approved minutes, newest first."""
        _require_member(user)
        rows = session.exec(
            select(MeetingMinutes).where(MeetingMinutes.status.in_(OFFICIAL))
            .order_by(MeetingMinutes.held_at.desc())
        ).all()
        out = []
        for m in rows:
            for item in m.agenda or []:
                v = vote_out(item.get("vote"))
                if v is None:
                    continue
                out.append(ResolutionOut(
                    minutes_id=m.id, reference=m.reference, held_at=m.held_at, meeting_title=m.title,
                    title=item.get("title", ""), decision=item.get("decision"), category=v.category,
                    votes_for=v.votes_for, votes_against=v.votes_against, abstained=v.abstained,
                    present=len(m.attendee_ids or []), result=v.result, unanimous=v.unanimous,
                ))
        return out

    def prefill(self, session: Session, user: User, event_id: uuid.UUID, occurrence: datetime) -> Prefill:
        """Details of a calendar meeting, and who replied 'Going'."""
        _require_writer(user)
        from app.services.calendar_service import can_see, find_occurrence

        event = session.get(CalendarEvent, event_id)
        if event is None or not can_see(user, event):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found.")
        occ_start, _ = find_occurrence(event, occurrence)
        going = session.exec(select(EventRsvp).where(EventRsvp.event_id == event.id, EventRsvp.response == "going")).all()
        members = {u.id for u in _members(session)}
        return Prefill(
            title=event.title, meeting_type="online" if event.is_online else "in_person", held_at=occ_start,
            location=event.location, event_id=event.id,
            suggested_attendee_ids=[r.user_id for r in going
                                    if abs((r.occurrence_start.replace(tzinfo=timezone.utc) if r.occurrence_start.tzinfo is None
                                            else r.occurrence_start) - occ_start).total_seconds() < 1 and r.user_id in members],
        )

    # ----------------------------------------------------------- writing
    def _apply(self, session: Session, m: MeetingMinutes, data: MinutesIn) -> None:
        members = {u.id for u in _members(session)}
        unknown = [i for i in data.attendee_ids if i not in members]
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attendees must be members of the cooperative.")
        present = len(set(data.attendee_ids))
        for item in data.agenda:
            if item.vote and item.vote.votes_for + item.vote.votes_against + item.vote.abstained > present:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"More votes than members present on \"{item.title}\".",
                )
        m.title, m.meeting_type, m.held_at = data.title, data.meeting_type, data.held_at
        m.location, m.event_id, m.chaired_by = data.location, data.event_id, data.chaired_by
        m.attendee_ids = [str(i) for i in dict.fromkeys(data.attendee_ids)]
        m.guests, m.other_business = data.guests, data.other_business
        m.agenda = [i.model_dump(mode="json") for i in data.agenda]
        m.members_total = len(members)
        m.updated_at = datetime.now(timezone.utc)

    def create(self, session: Session, user: User, data: MinutesIn) -> MeetingMinutes:
        _require_writer(user)
        m = MeetingMinutes(title=data.title, meeting_type=data.meeting_type, held_at=data.held_at,
                           chaired_by=data.chaired_by, recorded_by=user.id,
                           recorded_by_name=name_with_role(user) or user.first_name)
        self._apply(session, m, data)
        session.add(m)
        session.commit()
        session.refresh(m)
        return m

    def update(self, session: Session, user: User, minutes_id: uuid.UUID, data: MinutesIn) -> MeetingMinutes:
        _require_writer(user)
        m = self._visible(session, user, minutes_id)
        if m.status != MinutesStatus.DRAFT.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "Only draft minutes can be edited.")
        self._apply(session, m, data)
        session.add(m)
        session.commit()
        session.refresh(m)
        return m

    def submit(self, session: Session, user: User, minutes_id: uuid.UUID, background: Optional[BackgroundTasks]) -> MeetingMinutes:
        _require_writer(user)
        m = self._visible(session, user, minutes_id)
        if m.status != MinutesStatus.DRAFT.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "Only draft minutes can be submitted.")
        if not m.attendee_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Record who attended before submitting.")
        if not m.agenda or any(not (i.get("discussion") or i.get("decision")) for i in m.agenda):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Every agenda item needs what was discussed or what was concluded.")
        m.status = MinutesStatus.SUBMITTED.value
        m.submitted_at = datetime.now(timezone.utc)
        m.return_note = None
        session.add(m)
        recorder = session.get(User, m.recorded_by)
        notify(session, background, responsible_users(session, Duty.APPROVE_MINUTES, recorder), "minutes_submitted",
               NotificationType.MINUTES, title=m.title, recorder=m.recorded_by_name)
        session.commit()
        session.refresh(m)
        return m

    def _submitted(self, session: Session, user: User, minutes_id: uuid.UUID) -> MeetingMinutes:
        m = self._visible(session, user, minutes_id)
        require_duty(user, Duty.APPROVE_MINUTES, session.get(User, m.recorded_by))
        if m.status != MinutesStatus.SUBMITTED.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "These minutes are not awaiting approval.")
        return m

    def return_to_draft(self, session: Session, user: User, minutes_id: uuid.UUID, data: ReturnIn,
                        background: Optional[BackgroundTasks]) -> MeetingMinutes:
        m = self._submitted(session, user, minutes_id)
        m.status = MinutesStatus.DRAFT.value
        m.return_note = data.reason.strip()
        m.reviewed_by_name = name_with_role(user)
        session.add(m)
        notify(session, background, [session.get(User, m.recorded_by)], "minutes_returned", NotificationType.MINUTES,
               title=m.title, reviewer=m.reviewed_by_name, reason=m.return_note)
        session.commit()
        session.refresh(m)
        return m

    def approve(self, session: Session, user: User, minutes_id: uuid.UUID, background: Optional[BackgroundTasks]) -> MeetingMinutes:
        m = self._submitted(session, user, minutes_id)
        now = datetime.now(timezone.utc)
        m.status = MinutesStatus.APPROVED.value
        m.reviewed_by, m.reviewed_by_name, m.reviewed_at = user.id, name_with_role(user), now
        m.reference = next_reference(session, now)
        session.add(m)
        # Every member who attended is asked to sign
        attendees = [session.get(User, uuid.UUID(str(i))) for i in m.attendee_ids or []]
        attendees = [a for a in attendees if a is not None]
        for a in attendees:
            session.add(MinutesSignature(minutes_id=m.id, user_id=a.id, signer_name=f"{a.first_name} {a.last_name}".strip()))
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Couldn't number the minutes; please try again.")
        self._rebuild_pdf(session, user, m)
        notify(session, background, _members(session), "minutes_approved", NotificationType.MINUTES,
               title=m.title, reference=m.reference, reviewer=m.reviewed_by_name)
        notify(session, background, attendees, "minutes_sign_request", NotificationType.MINUTES,
               title=m.title, reference=m.reference)
        session.commit()
        session.refresh(m)
        return m

    def _rebuild_pdf(self, session: Session, user: User, m: MeetingMinutes) -> None:
        """(Re)make the PDF with the signatures so far; the old file is removed."""
        from app.services.reports.minutes_pdf import build_minutes_pdf

        paths = {r.user_id: document_storage.path_for(r.signature_file_key)
                 for r in self._signatures(session, m.id) if r.signature_file_key}
        data = build_minutes_pdf(self.to_out(session, user, m), m.reviewed_at or datetime.now(timezone.utc), paths)
        old = m.file_key
        m.file_key, m.sha256 = document_storage.save(data, prefix="minutes")
        session.add(m)
        if old:
            path = document_storage.path_for(old)
            if path:
                path.unlink(missing_ok=True)

    # ----------------------------------------------------------- signing
    def _my_row(self, session: Session, user: User, minutes_id: uuid.UUID) -> tuple[MeetingMinutes, MinutesSignature]:
        m = self._visible(session, user, minutes_id)
        row = session.exec(select(MinutesSignature).where(MinutesSignature.minutes_id == m.id,
                                                          MinutesSignature.user_id == user.id)).first()
        if row is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only members who attended sign the minutes.")
        if m.status != MinutesStatus.APPROVED.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "These minutes are not open for signatures.")
        if row.status == MinutesSignatureStatus.SIGNED.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "You have already signed these minutes.")
        return m, row

    def sign(self, session: Session, user: User, minutes_id: uuid.UUID, signature_image: str,
             background: Optional[BackgroundTasks]) -> MeetingMinutes:
        m, row = self._my_row(session, user, minutes_id)
        key, digest = save_signature(signature_image)
        delete_signature(row.signature_file_key)
        row.status = MinutesSignatureStatus.SIGNED.value
        row.signed_at = datetime.now(timezone.utc)
        row.signer_name = f"{user.first_name} {user.last_name}".strip()
        row.signature_file_key, row.signature_sha256, row.note = key, digest, None
        session.add(row)
        session.flush()
        rows = self._signatures(session, m.id)
        if all(r.status == MinutesSignatureStatus.SIGNED.value for r in rows):
            m.status = MinutesStatus.SIGNED.value
            people = {m.recorded_by, m.reviewed_by}
            notify(session, background, [session.get(User, i) for i in people if i], "minutes_fully_signed",
                   NotificationType.MINUTES, title=m.title, reference=m.reference, count=len(rows))
        self._rebuild_pdf(session, user, m)
        session.commit()
        session.refresh(m)
        return m

    def decline(self, session: Session, user: User, minutes_id: uuid.UUID, reason: str,
                background: Optional[BackgroundTasks]) -> MeetingMinutes:
        m, row = self._my_row(session, user, minutes_id)
        row.status = MinutesSignatureStatus.DECLINED.value
        row.note = reason.strip()
        row.signed_at = datetime.now(timezone.utc)
        session.add(row)
        people = {m.recorded_by, m.reviewed_by}
        notify(session, background, [session.get(User, i) for i in people if i and i != user.id],
               "minutes_sign_declined", NotificationType.MINUTES,
               title=m.title, member=f"{user.first_name} {user.last_name}".strip(), reason=row.note)
        self._rebuild_pdf(session, user, m)
        session.commit()
        session.refresh(m)
        return m

    def signature_image(self, session: Session, user: User, minutes_id: uuid.UUID, user_id: uuid.UUID) -> bytes:
        m = self._visible(session, user, minutes_id)
        row = session.exec(select(MinutesSignature).where(MinutesSignature.minutes_id == m.id,
                                                          MinutesSignature.user_id == user_id)).first()
        path = document_storage.path_for(row.signature_file_key) if row and row.signature_file_key else None
        if not path:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Signature not found.")
        return path.read_bytes()

    def pending_signatures(self, session: Session, user: User) -> int:
        """Approved minutes this member attended and hasn't signed (Home)."""
        rows = session.exec(select(MinutesSignature).where(
            MinutesSignature.user_id == user.id, MinutesSignature.status != MinutesSignatureStatus.SIGNED.value)).all()
        return sum(1 for r in rows if (mm := session.get(MeetingMinutes, r.minutes_id)) and mm.status == MinutesStatus.APPROVED.value)

    def pdf(self, session: Session, user: User, minutes_id: uuid.UUID) -> tuple[MeetingMinutes, bytes]:
        m = self._visible(session, user, minutes_id)
        path = document_storage.path_for(m.file_key) if m.file_key else None
        if not path or not path.is_file():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Minutes not found.")
        return m, path.read_bytes()


def next_reference(session: Session, when: datetime) -> str:
    prefix = f"YUG/MM/{to_local(when).year}/"
    taken = session.exec(select(MeetingMinutes.reference).where(MeetingMinutes.reference.like(f"{prefix}%"))).all()
    seq = max((int(r.rsplit("/", 1)[1]) for r in taken if r), default=0) + 1
    return f"{prefix}{seq:04d}"
