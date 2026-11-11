from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse
from celery.result import AsyncResult
from pathlib import Path
from PIL import Image, UnidentifiedImageError
import uuid
import io

from sqlmodel import Session

from app.api.dependencies.auth import get_current_active_user
from app.core.db import get_session
from app.services.receipt_service import ReceiptService
from app.core.redis_client import redis_client
from app.models.user_model import User
from app.tasks.ocr_task import process_ocr_task, celery_app

router = APIRouter(prefix="/v1/ocr", tags=["OCR"])
receipt_service = ReceiptService()

# temporary directory to store uploaded images
UPLOAD_DIR = Path("/tmp/ocr_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_PIXELS = 40_000_000  # ~ 6300 x 6300; receipts are far smaller
ALLOWED_FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
TASK_TTL_SECONDS = 3600  # matches Celery result_expires
RATE_LIMIT_UPLOADS = 20  # per user ...
RATE_LIMIT_WINDOW_SECONDS = 600  # ... per 10 minutes


def _task_key(task_id: str) -> str:
    return f"ocr_task:{task_id}"


def _get_owned_task(task_id: str, user: User) -> AsyncResult:
    """Only the user who uploaded the image may see or delete its task."""
    owner = redis_client.get(_task_key(task_id))
    if owner != str(user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return AsyncResult(task_id, app=celery_app)


def _enforce_rate_limit(user: User) -> None:
    key = f"ocr_rate:{user.id}"
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, RATE_LIMIT_WINDOW_SECONDS)
    if count > RATE_LIMIT_UPLOADS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many uploads. Please try again in a few minutes.",
        )


async def _read_limited(file: UploadFile) -> bytes:
    """Read the upload in chunks, aborting as soon as it exceeds the limit."""
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds 10MB limit.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _validate_image(contents: bytes) -> str:
    """Check the actual bytes (not the client's Content-Type) and return the
    file extension to use. Only reads the header, never decodes pixels."""
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid file type. Please upload a JPEG, PNG or WEBP image.",
    )
    try:
        with Image.open(io.BytesIO(contents)) as img:
            fmt, (width, height) = img.format, img.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise invalid
    if fmt not in ALLOWED_FORMATS:
        raise invalid
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image dimensions are too large.",
        )
    return ALLOWED_FORMATS[fmt]


@router.post("/process-image")
async def process_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """
    Upload a receipt image and start OCR processing.
    Returns a task ID to check the status later, and a receipt ID to attach
    to the deposit. A copy of the image is kept for treasurer review and
    deleted after RECEIPT_RETENTION_DAYS.
    """
    _enforce_rate_limit(current_user)

    contents = await _read_limited(file)
    extension = _validate_image(contents)

    # Keep a normalised copy for review (separate from the OCR working file)
    receipt = receipt_service.create_from_upload(session, current_user, contents)

    # Server-chosen name; the client's filename is never used on disk
    file_path = UPLOAD_DIR / f"{uuid.uuid4()}{extension}"
    with open(file_path, "wb") as f:
        f.write(contents)

    task = process_ocr_task.apply_async(args=[str(file_path), str(receipt.id)])
    redis_client.setex(_task_key(task.id), TASK_TTL_SECONDS, str(current_user.id))

    return JSONResponse(
        {
            "task_id": task.id,
            "receipt_id": str(receipt.id),
            "status": "processing",
            "message": "OCR processing has been initiated.",
        }
    )


@router.get("/task-status/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Check the status of one of your OCR tasks.
    Returns the status and result if completed.
    """
    task_result = _get_owned_task(task_id, current_user)

    if task_result.state == "PENDING":
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "pending",
                "message": "Task is pending execution.",
            }
        )
    elif task_result.state == "STARTED":
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "in_progress",
                "message": "Task is currently being processed.",
            }
        )
    elif task_result.state == "SUCCESS":
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "completed",
                "result": task_result.result,
            }
        )
    elif task_result.state == "FAILURE":
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "failed",
                # Generic message; internal errors stay in the worker logs
                "message": "Could not read the receipt image. Please enter the details manually or try a clearer image.",
            }
        )
    else:
        return JSONResponse(
            {
                "task_id": task_id,
                "status": task_result.state.lower(),
                "message": "Task is in an unknown state.",
            }
        )


@router.delete("/delete-task/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Delete the stored result of one of your completed or failed tasks.
    """
    task_result = _get_owned_task(task_id, current_user)

    if task_result.state in ["SUCCESS", "FAILURE"]:
        task_result.forget()  # removes the stored result from the backend
        redis_client.delete(_task_key(task_id))
        return JSONResponse(
            {
                "task_id": task_id,
                "status": "deleted",
                "message": "Task result has been deleted from the backend.",
            }
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Only completed or failed tasks can be deleted.",
        )
