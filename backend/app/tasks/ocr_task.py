from ..celery_app import celery_app
from celery.utils.log import get_task_logger
import os
from pathlib import Path
import logging

logger = get_task_logger(__name__)
logging.basicConfig(level=logging.INFO)


celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes hard limit
    task_soft_time_limit=240,  # 4 minutes soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=20,  # Restart worker after 10 tasks to prevent memory leaks
    result_expires=3600,  # Results expire in 1 hour
)


UPLOAD_DIR = Path("/tmp/ocr_uploads").resolve()


# Load OCRService here to avoid circular imports
@celery_app.task(bind=True, name="perform_ocr_task")
def process_ocr_task(self, image_path: str, receipt_id: str | None = None) -> dict:
    """
    Celery task to perform OCR on an image and extract transaction data.

    No retries: OCR is deterministic, so a retry would fail the same way
    (and the old retry ran after the image had already been deleted).
    """
    # Only ever touch files inside the upload directory
    if Path(image_path).resolve().parent != UPLOAD_DIR:
        raise ValueError("Refusing to process a file outside the upload directory")

    try:
        logger.info(f"Starting OCR task {self.request.id}")

        from app.services.ocr_service import (
            OCRService,
        )  # Local import to avoid circular dependency

        ocr_result = OCRService.perform_ocr_on_image(image_path)
        logger.info(f"OCR task completed: {self.request.id}")
        _record_on_receipt(receipt_id, ocr_result)

        return {"status": "success", "data": ocr_result}
    except Exception as exc:
        logger.error(f"OCR task {self.request.id} failed: {exc}")
        _record_on_receipt(receipt_id, None)
        raise RuntimeError("Could not read the receipt image") from exc
    finally:
        # Clean up temporary file
        if Path(image_path).exists():
            try:
                os.remove(image_path)
                logger.info(f"Temporary file {image_path} removed.")
            except Exception as cleanup_exc:
                logger.warning(
                    f"Failed to remove temporary file {image_path}: {cleanup_exc}"
                )



def _record_on_receipt(receipt_id: str | None, result: dict | None) -> None:
    """Store the server-side OCR values on the Receipt so reviewers can
    compare them with what the member submitted. Never fails the task."""
    if not receipt_id:
        return
    try:
        import uuid
        from sqlmodel import Session
        from app.core.db import engine
        from app.services.receipt_service import ReceiptService

        with Session(engine) as session:
            ReceiptService.record_ocr_result(session, uuid.UUID(receipt_id), result)
    except Exception as exc:
        logger.error(f"Could not store OCR result on receipt {receipt_id}: {exc}")


@celery_app.task(name="purge_expired_receipts")
def purge_expired_receipts() -> int:
    """Delete receipt images older than RECEIPT_RETENTION_DAYS (runs daily)."""
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.receipt_service import ReceiptService

    with Session(engine) as session:
        count = ReceiptService.purge_expired(session)
    logger.info(f"Purged {count} expired receipt image(s)")
    return count
