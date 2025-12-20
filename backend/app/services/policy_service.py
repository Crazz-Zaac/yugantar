from sqlmodel import Session, select
from sqlmodel import desc
from typing import Optional, Dict, Any, Type, TypeVar, Sequence
from datetime import datetime, timezone
import uuid
from decimal import Decimal

from app.models.policy.base_policy import BasePolicy
from app.models.policy.policy_change_log import PolicyChangeLog, ChangeType

TPolicy = TypeVar("TPolicy", bound=BasePolicy)


class PolicyService:
    """
    Generic service for managing policy records in the database.
    """

    def _json_safe(value: Any) -> Any:
        """
        Converts a value to a JSON-safe format.
        """
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, Decimal):
            return str(value)
        return value

    @staticmethod
    def _get_model_changes(
        old_model: Optional[BasePolicy], new_model: BasePolicy
    ) -> Dict[str, Dict[str, Any]]:
        """
        Compares two policy models and returns a dictionary of changes.
        """
        changes = {}
        if old_model is None:
            for field in new_model.__fields__:
                changes[field] = {
                    "old": None,
                    "new": PolicyService._json_safe(getattr(new_model, field)),
                }
        else:
            for field in new_model.__fields__:

                if field in ["id", "created_at", "updated_at"]:
                    continue  # Skip non-relevant fields

                old_value = getattr(old_model, field)
                new_value = getattr(new_model, field)

                if isinstance(old_value, datetime) and isinstance(new_value, datetime):
                    if abs((old_value - new_value).total_seconds()) > 1:
                        changes[field] = {
                            "old": PolicyService._json_safe(old_value),
                            "new": PolicyService._json_safe(new_value),
                        }
                else:
                    if old_value != new_value:
                        changes[field] = {
                            "old": PolicyService._json_safe(old_value),
                            "new": PolicyService._json_safe(new_value),
                        }
        return changes

    @staticmethod
    def serialize_policy_snapshot(policy: BasePolicy) -> Dict[str, Any]:
        """
        Serializes a policy model into a dictionary for snapshot storage.
        """
        data = {}
        for field in policy.__fields__:
            value = getattr(policy, field)
            data[field] = PolicyService._json_safe(value)
        return data

    @staticmethod
    def create_policy(
        db_session: Session,
        policy: TPolicy,
        change_reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        created_by: str = "system",
        user_agent: Optional[str] = None,
    ) -> TPolicy:
        """
        Creates a new policy record in the database with automatic change logging.
        """
        policy.created_by = created_by
        policy.version = 1

        # first the new policy needs to be added to the session and committed
        db_session.add(policy)
        db_session.commit()
        db_session.refresh(policy)

        change_log = PolicyChangeLog(
            policy_id=str(policy.policy_id),
            policy_type=policy.__class__.__name__,
            change_type=ChangeType.CREATED.value,
            version_before=None,
            version_after=1,
            changes=PolicyService._get_model_changes(None, policy),
            snapshot_after=PolicyService.serialize_policy_snapshot(policy),
            changed_by=created_by,
            changed_reason=change_reason,
            changed_from_ip=ip_address,
            user_agent=user_agent,
        )
        # add change log
        db_session.add(change_log)
        db_session.commit()

        return policy

    @staticmethod
    def update_policy(
        db_session: Session,
        policy_class: Type[TPolicy],
        policy_id: uuid.UUID,
        updated_data: Dict[str, Any],
        change_reason: str,
        ip_address: Optional[str] = None,
        updated_by: Optional[str] = "system",
        user_agent: Optional[str] = None,
    ) -> TPolicy:
        """
        Updates an existing policy record in the database.
        """
        statement = select(policy_class).where(policy_class.policy_id == policy_id)
        existing_policy = db_session.exec(statement).first()

        if not existing_policy:
            raise ValueError(f"Policy with id {policy_id} does not exist.")

        old_policy_snapshot = PolicyService.serialize_policy_snapshot(existing_policy)

        for key, value in updated_data.items():
            if hasattr(existing_policy, key):
                setattr(existing_policy, key, value)

        # Update audit fields
        existing_policy.updated_by = updated_by
        existing_policy.updated_at = datetime.now(timezone.utc)
        existing_policy.version += 1

        # first the existing policy needs to be added to the session
        db_session.add(existing_policy)

        old_model = policy_class(**{k: v for k, v in old_policy_snapshot.items()})

        changes = PolicyService._get_model_changes(old_model, existing_policy)

        # check if deactivation is True
        is_deactivation = "is_active" in updated_data and not updated_data["is_active"]
        change_type = (
            ChangeType.DEACTIVATED.value
            if is_deactivation
            else ChangeType.UPDATED.value
        )

        change_log = PolicyChangeLog(
            policy_id=existing_policy.policy_id,
            policy_type=policy_class.__name__,
            change_type=change_type,
            version_before=existing_policy.version - 1,
            version_after=existing_policy.version,
            changes=changes,
            snapshot_before=old_policy_snapshot,
            snapshot_after=PolicyService.serialize_policy_snapshot(existing_policy),
            changed_by=updated_by,
            changed_reason=change_reason,
            changed_from_ip=ip_address,
            user_agent=user_agent,
        )
        # add change log
        db_session.add(change_log)
        db_session.commit()
        db_session.refresh(existing_policy)

        return existing_policy

    @staticmethod
    def deactivate_policy(
        db_session: Session,
        policy_class: Type[TPolicy],
        policy_id: uuid.UUID,
        change_reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        deactivated_by: Optional[str] = "system",
    ) -> TPolicy:
        """
        Deactivates an existing policy record in the database.
        """
        return PolicyService.update_policy(
            db_session=db_session,
            policy_class=policy_class,
            policy_id=policy_id,
            change_reason=change_reason or "Policy deactivated",
            updated_data={
                "is_active": False,
                "effective_to": datetime.now(timezone.utc),
            },
            ip_address=ip_address,
            updated_by=deactivated_by,
        )

    @staticmethod
    def get_policy_history(
        db_session: Session,
        policy_id: uuid.UUID,
    ) -> Sequence[PolicyChangeLog]:
        """
        Retrieves the change history for a given policy.
        """
        statement = (
            select(PolicyChangeLog)
            .where(PolicyChangeLog.policy_id == policy_id)
            .order_by(desc(PolicyChangeLog.changed_at))
        )
        change_logs = db_session.exec(statement).fetchall()
        return change_logs
