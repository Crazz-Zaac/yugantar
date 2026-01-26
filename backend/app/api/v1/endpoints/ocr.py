from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from celery.result import AsyncResult
from pathlib import Path
import uuid
import shutil

from app.tasks.ocr_task import process_ocr_task, celery_app

router = APIRouter(prefix="/v1/ocr", tags=["OCR"])

# temporary directory to store uploaded images
UPLOAD_DIR = Path("/tmp/ocr_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/process-image")
async def process_image(file: UploadFile = File(...)):
    """
    Endpoint to upload an image file and initiate OCR processing.
    Returns a task ID to check the status later.
    """

    # validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload an image."
        )

    # validate file size (max 10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit.")

    # generate a unique filename
    file_path = UPLOAD_DIR / f"{uuid.uuid4()}_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(contents)

    # Queue the OCR processing task
    task = process_ocr_task.apply_async(args=[str(file_path)])

    return JSONResponse(
        {
            "task_id": task.id,
            "status": "processing",
            "message": "OCR processing has been initiated.",
        }
    )


@router.get("/task-status/{task_id}")
async def get_task_status(task_id: str):
    """
    Endpoint to check the status of an OCR processing task.
    Returns the status and result if completed.
    """
    task_result = AsyncResult(task_id, app=celery_app)

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
                "message": str(task_result.result),
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
async def delete_task(task_id: str):
    """
    Endpoint to delete a completed or failed task result from the backend.
    """
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state in ["SUCCESS", "FAILURE"]:
        # task_result.forget()
        task_result.revoke(terminate=True)
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
