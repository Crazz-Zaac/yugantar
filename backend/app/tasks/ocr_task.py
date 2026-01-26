from ..celery_app import celery_app
from celery.utils.log import get_task_logger
import os
import numpy as np
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


# Load OCRService here to avoid circular imports
@celery_app.task(
    bind=True,
    name="perform_ocr_task",
    max_retries=3,
    default_retry_delay=5,  # seconds
)
def process_ocr_task(self, image_path: str) -> dict:
    """
    Celery task to perform OCR on an image and extract transaction data.
    Retries up to 3 times in case of failure.
    """

    try:
        logger.info(
            f"Starting OCR task for image: {self.request.id} at path: {image_path}"
        )

        # Perform OCR using OCRService
        from app.services.ocr_service import (
            OCRService,
        )  # Local import to avoid circular dependency

        ocr_result = OCRService.perform_ocr_on_image(image_path)
        logger.info(f"OCR task completed for image: {self.request.id}")

        return {"status": "success", "data": ocr_result}
    except Exception as exc:
        logger.error(f"OCR task failed for image: {self.request.id} with error: {exc}")
        raise self.retry(exc=exc)
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
