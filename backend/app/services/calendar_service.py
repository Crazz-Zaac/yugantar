"""
The cooperative calendar and online meetings.

Who may do what
  * Every active member sees events for "members"; office bearers (President,
    Treasurer, Secretary) also see "office bearers only" events.
  * Office bearers create, change and cancel the cooperative's events.
    Changes and cancellations notify everyone who can see the event.
  * Any member can add personal events: only they see them, nobody is
    notified (except their own reminder), and they edit or delete them.
    Office bearers can't see other people's personal events either.
  * Anyone who can see an online event may join it from
    MEETING_JOIN_EARLY_MINUTES before it starts until MEETING_JOIN_LATE_MINUTES
    after it ends. Office bearers and the organiser join as moderators.

Besides stored events, the calendar shows (read-only) the monthly deposit due
dates, policy signing deadlines and the member's own loan maturity dates,
computed from the existing data: nothing is copied, so they can't go stale.
"""

import calendar as _cal
import secrets
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterator, Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, or_, select

from app import i18n
from app.core.config import settings
from app.models.calendar_model import (
    CalendarEvent,
    EventCategory,
    EventRecurrence,
    EventRsvp,
    EventVisibility,
)
from app.models.loan_model import Loan, LoanStatus
from app.models.notification_model import NotificationType
from app.models.policy.base_policy import PolicyStatus
from app.models.user_model import User
from app.schemas.calendar_schema import (
    CalendarFeed,
    CalendarItem,
    EventCreate,
    EventUpdate,
    JoinInfo,
    MeetNowRequest,
    RsvpCounts,
    RsvpPerson,
    RsvpRequest,
)
from app.services import jaas
from app.services.duties import coop_roles, is_active_member, is_office_bearer, name_with_role
from app.services.notify import notify
from app.utils.local_time import LOCAL_TZ, LOCAL_TZ_LABEL, to_local

MAX_RANGE_DAYS = 120
MAX_OCCURRENCES = 1500

CATEGORY_LABEL = {
    EventCategory.MEETING: i18n.both("Meeting", "बैठक"),
    EventCategory.GENERAL_ASSEMBLY: i18n.both("General assembly", "साधारण सभा"),
    EventCategory.HOLIDAY: i18n.both("Holiday", "बिदा"),
    EventCategory.NOTICE: i18n.both("Notice", "सूचना"),
    EventCategory.OTHER: i18n.both("Event", "कार्यक्रम"),
    EventCategory.PERSONAL: i18n.both("Personal", "व्यक्तिगत"),
}


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _local_midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, LOCAL_TZ).astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------
def is_calendar_member(user: Optional[User]) -> bool:
    """Active member of the cooperative (not a bare technical account)."""
    return user is not None and is_active_member(user) and bool(user.cooperative_roles)


def require_member(user: User) -> None:
    if not is_calendar_member(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The calendar is only available to members.")


def require_manager(user: User) -> None:
    require_member(user)
    if not is_office_bearer(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only office bearers (President, Treasurer, Secretary) can manage events."
        )


def is_personal(event: CalendarEvent) -> bool:
    return event.visibility == EventVisibility.PRIVATE


def can_see(user: User, event: CalendarEvent) -> bool:
    if is_personal(event):
        return event.created_by == user.id
    return event.visibility != EventVisibility.OFFICE_BEARERS or is_office_bearer(user)


def can_manage(user: User, event: CalendarEvent) -> bool:
    """Personal events: their owner. Cooperative events: office bearers."""
    return event.created_by == user.id if is_personal(event) else is_office_bearer(user)


def require_can_manage(user: User, event: CalendarEvent) -> None:
    if not can_manage(user, event):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only office bearers (President, Treasurer, Secretary) can manage events."
        )


def require_can_publish(user: User, visibility) -> None:
    """Only office bearers put events on the cooperative's calendar."""
    if getattr(visibility, "value", visibility) != EventVisibility.PRIVATE.value and not is_office_bearer(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only office bearers can add events for the cooperative. You can add personal events that only you see.",
        )


def audience(session: Session, event: CalendarEvent, exclude: Optional[uuid.UUID] = None) -> list[User]:
    """Everyone who can see `event` (to be notified)."""
    users = [u for u in session.exec(select(User)).all() if is_calendar_member(u) and u.id != exclude]
    return [u for u in users if can_see(u, event)]


# ---------------------------------------------------------------------------
# Occurrences of repeating events
# ---------------------------------------------------------------------------
def _add_months(local: datetime, months: int) -> datetime:
    y, m = divmod(local.month - 1 + months, 12)
    year, month = local.year + y, m + 1
    day = min(local.day, _cal.monthrange(year, month)[1])
    return local.replace(year=year, month=month, day=day)


def occurrences(event: CalendarEvent, start: datetime, end: datetime) -> Iterator[tuple[datetime, datetime]]:
    """(start, end) of each occurrence overlapping [start, end), in UTC."""
    first, duration = _utc(event.start_at), _utc(event.end_at) - _utc(event.start_at)
    until = _utc(event.repeat_until) if event.repeat_until else None
    recurrence = EventRecurrence(event.recurrence)

    if recurrence == EventRecurrence.NONE:
        if first < end and first + duration > start:
            yield first, first + duration
        return

    local_first = to_local(first)
    k = 0
    if recurrence == EventRecurrence.WEEKLY and start - duration > first:
        k = max(0, (start - duration - first) // timedelta(weeks=1))
    for _ in range(MAX_OCCURRENCES):
        if recurrence == EventRecurrence.WEEKLY:
            occ = first + timedelta(weeks=k)
        else:
            occ = _add_months(local_first, k).astimezone(timezone.utc)
        k += 1
        if occ >= end or (until is not None and occ > until):
            return
        if occ + duration > start:
            yield occ, occ + duration


def next_occurrence(event: CalendarEvent, after: datetime) -> Optional[tuple[datetime, datetime]]:
    """The first occurrence that hasn't ended by `after` (within a year)."""
    return next(occurrences(event, after, after + timedelta(days=366)), None)


def find_occurrence(event: CalendarEvent, occurrence_start: datetime) -> tuple[datetime, datetime]:
    occurrence_start = _utc(occurrence_start)
    for occ in occurrences(event, occurrence_start - timedelta(seconds=1), occurrence_start + timedelta(seconds=1)):
        if abs((occ[0] - occurrence_start).total_seconds()) < 1:
            return occ
    raise HTTPException(status.HTTP_404_NOT_FOUND, "This event doesn't take place at that time.")


# ---------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------
def when_text(start: datetime, end: datetime, all_day: bool, lang: str) -> str:
    """'Sat 21 Nov 2026, 15:00–16:00 NPT' / 'वि.सं. २०८३ मंसिर ५, १५:००–१६:००'."""
    from app.services.policy_document import ne_date

    ls, le = to_local(start), to_local(end)
    if lang == "ne":
        day = ne_date(start).split(" (")[0]
        if all_day:
            last = le - timedelta(microseconds=1)
            if last.date() != ls.date():
                return f"{day} – {ne_date(last).split(' (')[0]} (दिनभरि)"
            return f"{day} (दिनभरि)"
        return f"{day}, {i18n.ne_digits(ls.strftime('%H:%M'))}–{i18n.ne_digits(le.strftime('%H:%M'))}"
    if all_day:
        last = le - timedelta(microseconds=1)
        if last.date() != ls.date():
            return f"{ls:%a %d %b %Y} – {last:%a %d %b %Y} (all day)"
        return f"{ls:%a %d %b %Y} (all day)"
    return f"{ls:%a %d %b %Y}, {ls:%H:%M}–{le:%H:%M} {LOCAL_TZ_LABEL}"


def when_both(start: datetime, end: datetime, all_day: bool) -> dict:
    return i18n.both(when_text(start, end, all_day, "en"), when_text(start, end, all_day, "ne"))


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class CalendarService:
    # ----------------------------------------------------------- reading
    def feed(
        self,
        session: Session,
        user: User,
        start: datetime,
        end: datetime,
        lang: str,
        online_only: bool = False,
        include_due_dates: bool = True,
    ) -> CalendarFeed:
        require_member(user)
        start, end = _utc(start), _utc(end)
        if end <= start:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The end of the range must be after its start.")
        if end - start > timedelta(days=MAX_RANGE_DAYS):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ask for at most 120 days at a time.")

        items = self._event_items(session, user, start, end, online_only)
        if include_due_dates and not online_only:
            items += self._due_items(session, user, start, end, lang)
        items.sort(key=lambda i: (i.start, not i.all_day, i.title))
        return CalendarFeed(items=items, can_manage=is_office_bearer(user), meetings_enabled=jaas.enabled())

    def upcoming(self, session: Session, user: User, lang: str, limit: int = 5) -> CalendarFeed:
        now = datetime.now(timezone.utc)
        feed = self.feed(session, user, now, now + timedelta(days=60), lang)
        feed.items = [i for i in feed.items if not i.cancelled][:limit]
        return feed

    def _event_items(self, session, user, start, end, online_only) -> list[CalendarItem]:
        q = select(CalendarEvent).where(
            CalendarEvent.start_at < end,
            or_(
                CalendarEvent.recurrence == EventRecurrence.NONE.value,
                CalendarEvent.repeat_until.is_(None),
                CalendarEvent.repeat_until >= start - timedelta(days=15),
            ),
        )
        if online_only:
            q = q.where(CalendarEvent.is_online == True)  # noqa: E712
        events = [e for e in session.exec(q).all() if can_see(user, e)]
        if not events:
            return []

        rsvps = session.exec(select(EventRsvp).where(EventRsvp.event_id.in_([e.id for e in events]))).all()
        counts: dict[tuple, RsvpCounts] = defaultdict(RsvpCounts)
        mine: dict[tuple, str] = {}
        for r in rsvps:
            key = (r.event_id, _utc(r.occurrence_start))
            setattr(counts[key], r.response, getattr(counts[key], r.response) + 1)
            if r.user_id == user.id:
                mine[key] = r.response

        organizers = {
            u.id: u for u in session.exec(select(User).where(User.id.in_({e.created_by for e in events}))).all()
        }
        items = []
        for e in events:
            for occ_start, occ_end in occurrences(e, start, end):
                key = (e.id, occ_start)
                items.append(
                    CalendarItem(
                        id=f"{e.id}:{int(occ_start.timestamp())}",
                        kind="event",
                        event_id=e.id,
                        title=e.title,
                        description=e.description,
                        category=e.category,
                        visibility=e.visibility,
                        start=occ_start,
                        end=occ_end,
                        all_day=e.all_day,
                        location=e.location,
                        is_online=e.is_online,
                        recurrence=e.recurrence,
                        repeat_until=e.repeat_until,
                        series_start=e.start_at,
                        series_end=e.end_at,
                        cancelled=e.cancelled,
                        organizer_name=name_with_role(organizers.get(e.created_by)),
                        rsvp=None if is_personal(e) else counts.get(key, RsvpCounts()),
                        my_response=None if is_personal(e) else mine.get(key),
                        join_from=self._join_window(occ_start, occ_end)[0] if e.is_online else None,
                        join_until=self._join_window(occ_start, occ_end)[1] if e.is_online else None,
                        can_edit=can_manage(user, e) and not e.cancelled,
                    )
                )
        return items

    def _due_items(self, session, user, start, end, lang) -> list[CalendarItem]:
        from app.services.policy_lifecycle import current_deposit_policy
        from app.services.policy_signing_service import POLICY_MODELS, policy_label
        from app.utils.deposit_date_utils import calculate_due_date

        items: list[CalendarItem] = []
        ne = lang == "ne"

        # Deposit due dates under the deposit policy in force
        policy = current_deposit_policy(session)
        if policy is not None:
            ref = start - timedelta(days=1)
            policy_end = _utc(policy.effective_to) if policy.effective_to else None
            for _ in range(10):
                try:
                    due = _utc(calculate_due_date(policy, ref))
                except ValueError:
                    break
                if due >= end or (policy_end and due > policy_end):
                    break
                if due >= _utc(policy.effective_from) and due >= start:
                    day = to_local(due).date()
                    amount = i18n.money(float(policy.amount_paisa) / 100, lang)
                    items.append(
                        CalendarItem(
                            id=f"deposit:{day.isoformat()}",
                            kind="deposit_due",
                            title=f"मासिक जम्मा: {amount}" if ne else f"Deposit due: {amount}",
                            description=(
                                f"{i18n.translate_text(policy_label('deposit', policy), lang)}। "
                                "ढिलो जम्मामा जरिवाना लाग्छ।"
                                if ne
                                else f"{policy_label('deposit', policy)}. A late fine applies after this day."
                            ),
                            category="due_date",
                            start=_local_midnight(day),
                            end=_local_midnight(day + timedelta(days=1)),
                            all_day=True,
                            link="/dashboard/deposit",
                        )
                    )
                ref = due + timedelta(seconds=1)

        # Policy signing deadlines (policies open for signing)
        for policy_type, model in POLICY_MODELS.items():
            rows = session.exec(
                select(model).where(
                    model.status == PolicyStatus.FINALIZED,
                    model.signing_deadline >= start,
                    model.signing_deadline < end,
                )
            ).all()
            for p in rows:
                deadline = _utc(p.signing_deadline)
                label = policy_label(policy_type, p)
                items.append(
                    CalendarItem(
                        id=f"policy:{p.policy_id}",
                        kind="policy_deadline",
                        title="नीतिमा हस्ताक्षरको अन्तिम समय" if ne else "Policy signing closes",
                        description=i18n.translate_text(label, lang),
                        category="due_date",
                        start=deadline,
                        end=deadline,
                        link="/dashboard/policies",
                    )
                )

        # My loans' maturity dates
        loans = session.exec(
            select(Loan).where(
                Loan.user_id == user.id,
                Loan.status.in_([LoanStatus.APPROVED, LoanStatus.ACTIVE]),
                Loan.maturity_date >= start - timedelta(days=1),
                Loan.maturity_date < end,
            )
        ).all()
        for loan in loans:
            day = to_local(loan.maturity_date).date()
            if _local_midnight(day) < start:
                continue
            amount = i18n.money(float(loan.principal_paisa) / 100, lang)
            items.append(
                CalendarItem(
                    id=f"loan:{loan.id}",
                    kind="loan_maturity",
                    title=f"ऋण भुक्तानी अवधि सकिन्छ: {amount}" if ne else f"Loan matures: {amount}",
                    description=(
                        "तपाईंको ऋणको भुक्तानी गर्ने अन्तिम दिन (केवल तपाईंले देख्नुहुन्छ)।"
                        if ne
                        else "The last day to repay your loan (only you see this)."
                    ),
                    category="due_date",
                    start=_local_midnight(day),
                    end=_local_midnight(day + timedelta(days=1)),
                    all_day=True,
                    link="/dashboard/loans",
                )
            )
        return items

    def rsvp_people(self, session: Session, user: User, event_id: uuid.UUID, occurrence_start: datetime):
        event = self._visible_event(session, user, event_id)
        occ_start, _ = find_occurrence(event, occurrence_start)
        rows = session.exec(select(EventRsvp).where(EventRsvp.event_id == event.id)).all()
        rows = [r for r in rows if _utc(r.occurrence_start) == occ_start]
        users = {u.id: u for u in session.exec(select(User).where(User.id.in_([r.user_id for r in rows]))).all()}
        people = [
            RsvpPerson(name=f"{users[r.user_id].first_name} {users[r.user_id].last_name}".strip(), response=r.response)
            for r in rows
            if r.user_id in users
        ]
        return sorted(people, key=lambda p: (p.response, p.name.lower()))

    # ----------------------------------------------------------- writing
    @staticmethod
    def _normalize(data: EventCreate | EventUpdate) -> dict:
        values = data.model_dump(exclude={"notify"})
        start, end = _utc(data.start_at), _utc(data.end_at)
        if data.all_day:
            first = to_local(start).date()
            last = to_local(end - timedelta(microseconds=1)).date()
            start, end = _local_midnight(first), _local_midnight(max(last, first) + timedelta(days=1))
        values.update(start_at=start, end_at=end)
        if data.recurrence == EventRecurrence.NONE:
            values["repeat_until"] = None
        elif data.repeat_until is not None:
            values["repeat_until"] = _local_midnight(to_local(data.repeat_until).date() + timedelta(days=1)) - timedelta(
                seconds=1
            )
        if data.all_day:
            values["is_online"] = False
        if values["visibility"] in (EventVisibility.PRIVATE, EventVisibility.PRIVATE.value):
            # Personal: its own category, and no meeting room
            values["category"] = EventCategory.PERSONAL
            values["is_online"] = False
        elif values["category"] in (EventCategory.PERSONAL, EventCategory.PERSONAL.value):
            values["category"] = EventCategory.OTHER
        for key in ("category", "visibility", "recurrence"):
            values[key] = getattr(values[key], "value", values[key])
        return values

    def create(self, session: Session, user: User, data: EventCreate, background: BackgroundTasks) -> CalendarEvent:
        require_member(user)
        require_can_publish(user, data.visibility)
        values = self._normalize(data)
        if values["is_online"] and not jaas.enabled():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online meetings are not set up yet.")
        event = CalendarEvent(**values, created_by=user.id)
        if event.is_online:
            event.room_name = new_room_name()
        session.add(event)
        session.flush()
        if data.notify and not is_personal(event):
            occ = next_occurrence(event, datetime.now(timezone.utc)) or (_utc(event.start_at), _utc(event.end_at))
            key = "meeting_scheduled" if event.is_online else "event_created"
            notify(
                session, background, audience(session, event, exclude=user.id), key,
                NotificationType.MEETING if event.is_online else NotificationType.EVENT,
                title=event.title, organizer=name_with_role(user),
                when=when_both(occ[0], occ[1], event.all_day),
                category=CATEGORY_LABEL[EventCategory(event.category)],
            )
        session.commit()
        session.refresh(event)
        return event

    def meet_now(self, session: Session, user: User, data: MeetNowRequest, background: BackgroundTasks):
        require_manager(user)
        if data.visibility == EventVisibility.PRIVATE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Online meetings are for the cooperative, not personal events.")
        if not jaas.enabled():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online meetings are not set up yet.")
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        title = (data.title or "").strip() or f"Meeting with {user.first_name}"
        event = CalendarEvent(
            title=title[:200],
            category=EventCategory.MEETING.value,
            visibility=data.visibility.value,
            start_at=now,
            end_at=now + timedelta(minutes=data.minutes),
            is_online=True,
            room_name=new_room_name(),
            recurrence=EventRecurrence.NONE.value,
            created_by=user.id,
            last_reminded_start=now,  # no "starting soon" reminder: it already started
        )
        session.add(event)
        session.flush()
        notify(
            session, background, audience(session, event, exclude=user.id), "meeting_started",
            NotificationType.MEETING, title=event.title, organizer=name_with_role(user),
        )
        session.commit()
        session.refresh(event)
        return event

    def update(
        self, session: Session, user: User, event_id: uuid.UUID, data: EventUpdate, background: BackgroundTasks
    ) -> CalendarEvent:
        event = self._visible_event(session, user, event_id)
        require_can_manage(user, event)
        require_can_publish(user, data.visibility)
        if event.cancelled:
            raise HTTPException(status.HTTP_409_CONFLICT, "This event was cancelled and can't be changed.")
        values = self._normalize(data)
        if values["is_online"] and not event.is_online and not jaas.enabled():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online meetings are not set up yet.")
        before = (_utc(event.start_at), _utc(event.end_at), event.all_day, event.recurrence, event.location,
                  event.is_online)
        old_audience = {u.id: u for u in audience(session, event, exclude=user.id)}
        for k, v in values.items():
            setattr(event, k, v)
        if event.is_online and not event.room_name:
            event.room_name = new_room_name()
        after = (_utc(event.start_at), _utc(event.end_at), event.all_day, event.recurrence, event.location,
                 event.is_online)
        if before[:2] != after[:2]:
            event.last_reminded_start = None
            # Replies were for the old time
            for r in session.exec(select(EventRsvp).where(EventRsvp.event_id == event.id)).all():
                session.delete(r)
        event.updated_at = datetime.now(timezone.utc)
        session.add(event)
        if data.notify and before != after:
            # Tell the new audience; people who lose access (visibility
            # narrowed) are told it was cancelled for them
            new_audience = {u.id: u for u in audience(session, event, exclude=user.id)}
            occ = next_occurrence(event, datetime.now(timezone.utc)) or (_utc(event.start_at), _utc(event.end_at))
            notify(
                session, background, new_audience.values(), "event_updated",
                NotificationType.MEETING if event.is_online else NotificationType.EVENT,
                title=event.title, organizer=name_with_role(user), when=when_both(occ[0], occ[1], event.all_day),
            )
            removed = [u for uid, u in old_audience.items() if uid not in new_audience]
            if removed:
                notify(session, background, removed, "event_cancelled", NotificationType.EVENT,
                       title=event.title, organizer=name_with_role(user),
                       when=when_both(before[0], before[1], before[2]))
        session.commit()
        session.refresh(event)
        return event

    def cancel(self, session: Session, user: User, event_id: uuid.UUID, background: BackgroundTasks, notify_members=True):
        event = self._visible_event(session, user, event_id)
        require_can_manage(user, event)
        if event.cancelled:
            return event
        event.cancelled = True
        event.cancelled_at = datetime.now(timezone.utc)
        session.add(event)
        now = datetime.now(timezone.utc)
        occ = next_occurrence(event, now)
        if notify_members and occ is not None:  # nothing to tell if it's already over
            notify(
                session, background, audience(session, event, exclude=user.id), "event_cancelled",
                NotificationType.MEETING if event.is_online else NotificationType.EVENT,
                title=event.title, organizer=name_with_role(user), when=when_both(occ[0], occ[1], event.all_day),
            )
        session.commit()
        session.refresh(event)
        return event

    def set_rsvp(self, session: Session, user: User, event_id: uuid.UUID, data: RsvpRequest) -> None:
        event = self._visible_event(session, user, event_id)
        if is_personal(event):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Replies aren't used for personal events.")
        if event.cancelled:
            raise HTTPException(status.HTTP_409_CONFLICT, "This event was cancelled.")
        occ_start, occ_end = find_occurrence(event, data.occurrence_start)
        if occ_end < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_409_CONFLICT, "This event is already over.")
        row = session.exec(
            select(EventRsvp).where(
                EventRsvp.event_id == event.id, EventRsvp.user_id == user.id, EventRsvp.occurrence_start == occ_start
            )
        ).first()
        if row is None:
            row = EventRsvp(event_id=event.id, user_id=user.id, occurrence_start=occ_start, response=data.response)
        row.response = getattr(data.response, "value", data.response)
        row.updated_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()

    def delete_personal(self, session: Session, user: User, event_id: uuid.UUID) -> None:
        """Personal events are deleted by their owner (cooperative events
        are cancelled instead, so members see what happened)."""
        event = self._visible_event(session, user, event_id)
        if not is_personal(event):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Only personal events can be deleted; cooperative events are cancelled instead."
            )
        session.delete(event)
        session.commit()

    # ----------------------------------------------------------- meetings
    @staticmethod
    def _join_window(occ_start: datetime, occ_end: datetime) -> tuple[datetime, datetime]:
        return (
            occ_start - timedelta(minutes=settings.MEETING_JOIN_EARLY_MINUTES),
            occ_end + timedelta(minutes=settings.MEETING_JOIN_LATE_MINUTES),
        )

    def join(self, session: Session, user: User, event_id: uuid.UUID, occurrence_start: datetime) -> JoinInfo:
        event = self._visible_event(session, user, event_id)
        if not event.is_online or not event.room_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This event is not an online meeting.")
        if event.cancelled:
            raise HTTPException(status.HTTP_409_CONFLICT, "This meeting was cancelled.")
        if not jaas.enabled():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online meetings are not set up yet.")
        occ_start, occ_end = find_occurrence(event, occurrence_start)
        opens, closes = self._join_window(occ_start, occ_end)
        now = datetime.now(timezone.utc)
        if now < opens:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"The meeting opens {settings.MEETING_JOIN_EARLY_MINUTES} minutes before it starts.",
            )
        if now > closes:
            raise HTTPException(status.HTTP_409_CONFLICT, "This meeting has ended.")
        moderator = is_office_bearer(user) or event.created_by == user.id
        display = f"{user.first_name} {user.last_name}".strip()
        roles = [r.title() for r in ("president", "treasurer", "secretary") if r in coop_roles(user)]
        if roles:
            display += f" ({', '.join(roles)})"
        token = jaas.meeting_token(
            room_name=event.room_name,
            user_id=str(user.id),
            name=display,
            email=user.email,
            moderator=moderator,
            expires_at=int(closes.timestamp()),
        )
        return JoinInfo(
            domain=settings.JAAS_DOMAIN,
            room=jaas.full_room(event.room_name),
            jwt=token,
            moderator=moderator,
            title=event.title,
            display_name=display,
            ends_at=occ_end,
        )

    # ----------------------------------------------------------- reminders
    def send_reminders(self, session: Session, now: Optional[datetime] = None) -> int:
        """Remind everyone shortly before each timed event (runs every 5 min)."""
        now = now or datetime.now(timezone.utc)
        horizon = now + timedelta(minutes=settings.EVENT_REMINDER_MINUTES)
        events = session.exec(
            select(CalendarEvent).where(
                CalendarEvent.cancelled == False,  # noqa: E712
                CalendarEvent.all_day == False,  # noqa: E712
                CalendarEvent.start_at <= horizon,
                or_(
                    CalendarEvent.recurrence != EventRecurrence.NONE.value,
                    CalendarEvent.start_at > now,
                ),
            )
        ).all()
        sent = 0
        for event in events:
            occ = next((o for o in occurrences(event, now, horizon + timedelta(seconds=1)) if o[0] > now), None)
            if occ is None or (event.last_reminded_start and _utc(event.last_reminded_start) >= occ[0]):
                continue
            notify(
                session, None, audience(session, event), "meeting_reminder" if event.is_online else "event_reminder",
                NotificationType.MEETING if event.is_online else NotificationType.EVENT,
                send_email=False, title=event.title, when=when_both(occ[0], occ[1], event.all_day),
            )
            # Emails are sent here (no request background tasks in Celery)
            self._email_now(session, event, occ)
            event.last_reminded_start = occ[0]
            session.add(event)
            sent += 1
        session.commit()
        return sent

    @staticmethod
    def _email_now(session: Session, event: CalendarEvent, occ) -> None:
        import asyncio

        from fastapi_mail import NameEmail

        from app.services.email_notify import send_generic_email

        key = "meeting_reminder" if event.is_online else "event_reminder"
        values = {"title": event.title, "when": when_both(occ[0], occ[1], event.all_day)}
        for u in audience(session, event):
            if not u.email:
                continue
            subject, body = i18n.render_email(key, u.preferred_language, u.first_name, values)
            try:
                result = send_generic_email([NameEmail(name=u.first_name, email=u.email)], subject, body)
                if asyncio.iscoroutine(result):
                    asyncio.run(result)
            except Exception:  # noqa: BLE001 - a failed email must not stop the other reminders
                pass

    # ----------------------------------------------------------- helpers
    def _visible_event(self, session: Session, user: User, event_id: uuid.UUID) -> CalendarEvent:
        require_member(user)
        event = session.get(CalendarEvent, event_id)
        if event is None or not can_see(user, event):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found.")
        return event

    def ics(self, session: Session, user: User, event_id: uuid.UUID) -> str:
        """The event (whole series) as an iCalendar file for phone calendars."""
        event = self._visible_event(session, user, event_id)

        def fmt(dt: datetime) -> str:
            return _utc(dt).strftime("%Y%m%dT%H%M%SZ")

        def esc(text: str) -> str:
            return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Yugantar//Calendar//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:{event.id}@yugantar",
            f"DTSTAMP:{fmt(datetime.now(timezone.utc))}",
            f"SEQUENCE:{int(_utc(event.updated_at or event.created_at).timestamp()) % 100000}",
        ]
        if event.all_day:
            lines += [
                f"DTSTART;VALUE=DATE:{to_local(event.start_at):%Y%m%d}",
                f"DTEND;VALUE=DATE:{to_local(event.end_at):%Y%m%d}",
            ]
        else:
            lines += [f"DTSTART:{fmt(event.start_at)}", f"DTEND:{fmt(event.end_at)}"]
        if event.recurrence != EventRecurrence.NONE.value:
            rule = f"RRULE:FREQ={'WEEKLY' if event.recurrence == EventRecurrence.WEEKLY.value else 'MONTHLY'}"
            if event.repeat_until:
                rule += f";UNTIL={fmt(event.repeat_until)}"
            lines.append(rule)
        lines.append(f"SUMMARY:{esc(('CANCELLED: ' if event.cancelled else '') + event.title)}")
        description = event.description or ""
        if event.is_online:
            description = (description + "\n\n" if description else "") + "Online meeting: join from the Meetings page in Yugantar."
        if description:
            lines.append(f"DESCRIPTION:{esc(description)}")
        location = event.location or ("Yugantar (online)" if event.is_online else "")
        if location:
            lines.append(f"LOCATION:{esc(location)}")
        if event.cancelled:
            lines.append("STATUS:CANCELLED")
        lines += ["END:VEVENT", "END:VCALENDAR"]
        # Lines longer than 75 octets are folded (RFC 5545)
        out = []
        for line in lines:
            raw = line.encode()
            while len(raw) > 75:
                cut = 75
                while cut > 0 and (raw[cut] & 0xC0) == 0x80:
                    cut -= 1
                out.append(raw[:cut].decode())
                raw = b" " + raw[cut:]
            out.append(raw.decode())
        return "\r\n".join(out) + "\r\n"


def new_room_name() -> str:
    """Random and unguessable: the room is only reachable with our token
    or by people the app showed it to."""
    return f"yugantar-{secrets.token_hex(12)}"
