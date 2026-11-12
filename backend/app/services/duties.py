"""
Separation of duties for money decisions.

Rules (agreed with the committee):
  1. Nobody acts on their own money: their own deposit, loan, loan payment,
     or a policy they created.
  2. A loan's fund verification and its approval are done by two different
     people.
  3. Each duty belongs to one office role. When the person holding that role
     is the one asking, the Secretary steps in as the backup.
  4. Money decisions belong to the cooperative office bearers only
     (President, Treasurer, Secretary). Admin/Moderator are technical access
     roles for managing accounts; they get no financial powers from them.

    Duty                     Primary      Backup (when primary is the beneficiary)
    -----------------------  -----------  ----------------------------------------
    verify / delete deposit  Treasurer    Secretary
    review / delete payment  Treasurer    Secretary
    verify loan funds        Treasurer    Secretary
    approve / reject loan    President    Secretary
    create / edit policy     Treasurer    (none)

Policies are not approved by one person: every member signs them (see
services/policy_signing_service.py).
"""

from enum import Enum
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.user_model import CooperativeRole, User

OFFICE_ROLES = {
    CooperativeRole.PRESIDENT.value,
    CooperativeRole.TREASURER.value,
    CooperativeRole.SECRETARY.value,
}
BACKUP_ROLE = CooperativeRole.SECRETARY.value


class Duty(str, Enum):
    VERIFY_DEPOSIT = "verify deposits"
    REVIEW_LOAN_PAYMENT = "review loan payments"
    VERIFY_LOAN_FUNDS = "verify loan funds"
    DECIDE_LOAN = "approve or reject loans"
    MANAGE_POLICY = "create or edit policies"


PRIMARY_ROLE: dict[Duty, str] = {
    Duty.VERIFY_DEPOSIT: CooperativeRole.TREASURER.value,
    Duty.REVIEW_LOAN_PAYMENT: CooperativeRole.TREASURER.value,
    Duty.VERIFY_LOAN_FUNDS: CooperativeRole.TREASURER.value,
    Duty.DECIDE_LOAN: CooperativeRole.PRESIDENT.value,
    Duty.MANAGE_POLICY: CooperativeRole.TREASURER.value,
}
NO_BACKUP = {Duty.MANAGE_POLICY}


def coop_roles(user: Optional[User]) -> set[str]:
    if user is None:
        return set()
    return {str(getattr(r, "value", r)).lower() for r in (user.cooperative_roles or [])}


def is_active_member(user: User) -> bool:
    """Enabled, email-verified and approved: can actually use the app."""
    return not user.disabled and bool(user.is_verified) and bool(user.is_approved)


def name_with_role(user: Optional[User]) -> Optional[str]:
    """ "First Last (President)": office roles in title case, else "Member"."""
    if user is None:
        return None
    order = [CooperativeRole.PRESIDENT.value, CooperativeRole.TREASURER.value, CooperativeRole.SECRETARY.value]
    roles = [r.title() for r in order if r in coop_roles(user)] or ["Member"]
    return f"{user.first_name} {user.last_name}".strip() + f" ({', '.join(roles)})"


def is_system_admin(user: Optional[User]) -> bool:
    """Has the ADMIN access role (the system administration account)."""
    if user is None:
        return False
    return "admin" in {str(getattr(r, "value", r)).lower() for r in (user.access_roles or [])}


def can_be_guarantor(user: Optional[User]) -> bool:
    """An active cooperative member who isn't a system admin account."""
    return user is not None and is_active_member(user) and not is_system_admin(user) and bool(user.cooperative_roles)


def is_office_bearer(user: User) -> bool:
    return bool(coop_roles(user) & OFFICE_ROLES)


def denial_reason(user: User, duty: Duty, beneficiary: Optional[User] = None) -> Optional[str]:
    """None if `user` may perform `duty` on an item belonging to `beneficiary`,
    otherwise a human-readable reason."""
    primary = PRIMARY_ROLE[duty]
    roles = coop_roles(user)

    if beneficiary is not None and beneficiary.id == user.id:
        handler = "the Secretary" if primary in roles else f"the {primary.title()}"
        return f"You can't act on your own item ({duty.value}); {handler} has to do it."
    if primary in roles:
        return None
    if (
        duty not in NO_BACKUP
        and BACKUP_ROLE in roles
        and primary in coop_roles(beneficiary)
    ):
        return None

    msg = f"Only the {primary.title()} can {duty.value}"
    if duty not in NO_BACKUP:
        msg += f" (the Secretary steps in when it's the {primary.title()}'s own item)"
    return msg + "."


def require_duty(user: User, duty: Duty, beneficiary: Optional[User] = None) -> None:
    reason = denial_reason(user, duty, beneficiary)
    if reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)


def may_perform_any(user: User, duty: Duty) -> bool:
    """Could this user perform `duty` on at least some items? (for review queues)"""
    roles = coop_roles(user)
    return PRIMARY_ROLE[duty] in roles or (duty not in NO_BACKUP and BACKUP_ROLE in roles)


def responsible_users(session: Session, duty: Duty, beneficiary: Optional[User] = None) -> list[User]:
    """Who should be notified to act: holders of the primary role other than
    the beneficiary, plus the Secretary when the beneficiary holds that role
    (or nobody else does)."""
    primary = PRIMARY_ROLE[duty]
    users = [u for u in session.exec(select(User)).all() if is_active_member(u)]
    exclude = beneficiary.id if beneficiary else None

    result = [u for u in users if primary in coop_roles(u) and u.id != exclude]
    if duty not in NO_BACKUP and (not result or primary in coop_roles(beneficiary)):
        result += [
            u for u in users
            if BACKUP_ROLE in coop_roles(u) and u.id != exclude and u not in result
        ]
    return result
