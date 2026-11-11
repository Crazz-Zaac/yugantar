from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.dependencies.auth import get_current_active_user
from app.core.db import get_session
from app.core.receipt_storage import receipt_storage
from app.models.user_model import User
from app.schemas.receipt_schema import ReceiptResponse
from app.services.receipt_service import ReceiptService

router = APIRouter(prefix="/receipts", tags=["receipts"])
receipt_service = ReceiptService()


@router.get("/{receipt_id}", response_model=ReceiptResponse)
def get_receipt(
    receipt_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Receipt details: what OCR read vs. what was submitted, plus duplicate
    warnings. Uploader or treasurer/moderator/admin only."""
    receipt = receipt_service.get_for_viewer(session, receipt_id, current_user)
    return receipt_service.to_response(session, receipt)


@router.get("/{receipt_id}/image")
def get_receipt_image(
    receipt_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The voucher image. Uploader or treasurer/moderator/admin only."""
    receipt = receipt_service.get_for_viewer(session, receipt_id, current_user)
    path = receipt_storage.path_for(receipt.file_key) if receipt.file_key else None
    if not path:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The receipt image has been deleted after the retention period.",
        )
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            # Members' bank screenshots: never cache in browsers or proxies
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )
