import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.receipt_storage import normalize_receipt_image, receipt_storage
from app.models.deposit_model import Deposit
from app.models.loan_payment import LoanPayment
from app.models.mixins.money import MoneyMixin
from app.models.receipt_model import Receipt
from app.models.user_model import User
from app.schemas.receipt_schema import ReceiptDuplicate, ReceiptResponse
from app.services.deposit_service import DepositService

_AMBIGUOUS = str.maketrans({"O": "0", "Q": "0", "I": "1", "L": "1"})


def reference_key(reference: Optional[str]) -> Optional[str]:
    """Normalise a bank reference so OCR look-alikes (O/0, I/1...) match."""
    if not reference:
        return None
    key = re.sub(r"[^A-Z0-9]", "", reference.upper()).translate(_AMBIGUOUS)
    return key or None


def _paisa_to_rupees(paisa: Optional[int]) -> Optional[Decimal]:
    return None if paisa is None else Decimal(paisa) / 100


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class ReceiptService:
    """Receipt images: upload, OCR result, review access, retention."""

    # Upload / OCR

    def create_from_upload(self, session: Session, user: User, contents: bytes) -> Receipt:
        """Store a normalised copy of an uploaded voucher image."""
        stored = normalize_receipt_image(contents)
        key = receipt_storage.save(stored)
        now = datetime.now(timezone.utc)
        receipt = Receipt(
            user_id=user.id,
            date=now,
            file_key=key,
            content_hash=hashlib.sha256(contents).hexdigest(),
            size_bytes=len(stored),
            expires_at=now + timedelta(days=settings.RECEIPT_RETENTION_DAYS),
            ocr_status="pending",
        )
        try:
            session.add(receipt)
            session.commit()
        except Exception:
            receipt_storage.delete(key)
            raise
        session.refresh(receipt)
        return receipt

    @staticmethod
    def record_ocr_result(session: Session, receipt_id: uuid.UUID, result: Optional[dict]) -> None:
        """Called by the OCR worker. result=None means OCR failed."""
        receipt = session.get(Receipt, receipt_id)
        if not receipt:
            return
        if result is None:
            receipt.ocr_status = "failed"
        else:
            receipt.ocr_status = "completed"
            if result.get("amount") is not None:
                receipt.ocr_amount_paisa = MoneyMixin.rupees_to_paisa(Decimal(str(result["amount"])))
            if result.get("charge") is not None:
                receipt.ocr_charge_paisa = MoneyMixin.rupees_to_paisa(Decimal(str(result["charge"])))
            if result.get("date"):
                receipt.ocr_date = datetime.fromisoformat(result["date"])
            receipt.reference = (result.get("reference") or None) and result["reference"][:64]
            receipt.reference_key = reference_key(receipt.reference)
        session.add(receipt)
        session.commit()

    # Access

    def get_for_viewer(self, session: Session, receipt_id: uuid.UUID, user: User) -> Receipt:
        """Uploader or deposit reviewers only; everyone else gets 404."""
        receipt = session.get(Receipt, receipt_id)
        if not receipt or (
            receipt.user_id != user.id and not DepositService._is_deposit_reviewer(user)
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
        return receipt

    def claim_for_deposit(self, session: Session, receipt_id: uuid.UUID, user_id: uuid.UUID) -> Receipt:
        """Validate that the member may attach this receipt to a new deposit."""
        receipt = session.get(Receipt, receipt_id)
        if not receipt or receipt.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
        if receipt.file_key is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This receipt has expired. Please upload the voucher again.",
            )
        already_used = session.exec(select(Deposit).where(Deposit.receipt_id == receipt.id)).first()
        if already_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This receipt is already attached to another deposit.",
            )
        return receipt

    # Review view

    def to_response(self, session: Session, receipt: Receipt) -> ReceiptResponse:
        deposit = session.exec(select(Deposit).where(Deposit.receipt_id == receipt.id)).first()

        amount_differs = date_differs = False
        if deposit:
            if receipt.ocr_amount_paisa is not None:
                amount_differs = deposit.amount_paisa != receipt.ocr_amount_paisa
            dep_date, ocr_date = _as_utc(deposit.deposited_date), _as_utc(receipt.ocr_date)
            if dep_date and ocr_date:
                date_differs = abs((dep_date - ocr_date).total_seconds()) > 60

        return ReceiptResponse(
            id=receipt.id,
            user_id=receipt.user_id,
            uploaded_at=receipt.date,
            expires_at=receipt.expires_at,
            image_available=receipt.file_key is not None,
            ocr_status=receipt.ocr_status,
            ocr_amount=_paisa_to_rupees(receipt.ocr_amount_paisa),
            ocr_charge=_paisa_to_rupees(receipt.ocr_charge_paisa),
            ocr_date=receipt.ocr_date,
            ocr_reference=receipt.reference,
            deposit_id=deposit.id if deposit else None,
            submitted_amount=_paisa_to_rupees(deposit.amount_paisa) if deposit else None,
            submitted_date=deposit.deposited_date if deposit else None,
            amount_differs_from_ocr=amount_differs,
            date_differs_from_ocr=date_differs,
            duplicates=self._find_duplicates(session, receipt),
        )

    @staticmethod
    def _find_duplicates(session: Session, receipt: Receipt) -> list[ReceiptDuplicate]:
        """Other deposits backed by the same image or the same bank reference."""
        found: dict[uuid.UUID, ReceiptDuplicate] = {}
        checks = [("same_image", Receipt.content_hash == receipt.content_hash)]
        if receipt.reference_key:
            checks.append(("same_reference", Receipt.reference_key == receipt.reference_key))

        for match, condition in checks:
            rows = session.exec(
                select(Deposit, Receipt)
                .join(Receipt, Deposit.receipt_id == Receipt.id)
                .where(condition, Receipt.id != receipt.id)
            ).all()
            for dep, _ in rows:
                found.setdefault(
                    dep.id, ReceiptDuplicate(deposit_id=dep.id, user_id=dep.user_id, match=match)
                )
        return list(found.values())

    # Retention

    @staticmethod
    def purge_expired(session: Session) -> int:
        """Delete images past their retention date.

        Receipts never attached to a deposit are removed entirely; for the
        rest only the image is deleted and the metadata/OCR values are kept.
        """
        now = datetime.now(timezone.utc)
        expired = session.exec(
            select(Receipt).where(Receipt.expires_at <= now, Receipt.file_key.is_not(None))
        ).all()
        for receipt in expired:
            receipt_storage.delete(receipt.file_key)
            linked = session.exec(
                select(Deposit.id).where(Deposit.receipt_id == receipt.id)
            ).first() or session.exec(
                select(LoanPayment.id).where(LoanPayment.receipt_id == receipt.id)
            ).first()
            if linked is None:
                session.delete(receipt)
            else:
                receipt.file_key = None
                receipt.image_deleted_at = now
                session.add(receipt)
        session.commit()

        # Safety net: files on disk past retention that no receipt row points
        # to (e.g. an upload whose DB transaction never committed).
        cutoff = now - timedelta(days=settings.RECEIPT_RETENTION_DAYS)
        old_keys = receipt_storage.keys_older_than(cutoff)
        orphans = 0
        if old_keys:
            known = set(
                session.exec(select(Receipt.file_key).where(Receipt.file_key.in_(old_keys))).all()
            )
            for key in old_keys:
                if key not in known:
                    receipt_storage.delete(key)
                    orphans += 1
        return len(expired) + orphans
