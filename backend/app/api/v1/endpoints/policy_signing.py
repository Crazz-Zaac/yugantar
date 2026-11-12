"""
Policy approval by member signatures (see services/policy_signing_service.py).

  POST /policies/{type}/{id}/submit      Treasurer signs and opens it for signing
  POST /policies/{type}/{id}/withdraw    Treasurer pulls it back to draft to revise
  GET  /policies/{type}/{id}/signatures  Who has signed (any member)
  POST /policies/{type}/{id}/sign        Approve or reject (required signers)
  GET  /policies/{type}/{id}/record      Adoption record PDF (any member, once adopted)
  GET  /policies/{type}/{id}/signatures/{user_id}/image   A member's hand signature (any member)
  POST /policies/{type}/{id}/proxy-requests   Admin: sign on behalf of an absent member
  GET  /policies/proxy-requests               Admin / office bearers
  POST /policies/proxy-requests/{id}/authorise  President / Treasurer / Secretary
  POST /policies/proxy-requests/{id}/cancel     Admin
"""

from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.core.document_storage import document_storage
from app.services import policy_document

from app.api.dependencies.admin import get_current_policy_manager
from app.api.dependencies.auth import get_current_active_user
from app.core.db import get_session
from app.models.policy.policy_signature import ProxyRequestStatus
from app.models.user_model import User
from app.schemas.policy.policy_signing_schema import (
    OpenForSigningRequest,
    ProxyAuthoriseRequest,
    ProxyRequestCreate,
    ProxyRequestOut,
    SigningSummary,
    SignRequest,
    StatementPreview,
)
from app.models.policy.deposit_policy import DepositPolicy
from app.models.policy.loan_policy import LoanPolicy
from app.schemas.policy.deposit_policy_schema import DepositPolicyCreate
from app.schemas.policy.loan_policy_schema import LoanPolicyCreate
from app.services.policy_signing_service import PolicySigningService

router = APIRouter(prefix="/policies", tags=["policy signing"])
service = PolicySigningService()
PolicyType = Literal["deposit", "loan"]


# Proxy-request routes first so "proxy-requests" is never read as a policy type
@router.get("/proxy-requests", response_model=List[ProxyRequestOut])
def list_proxy_requests(
    status: Optional[ProxyRequestStatus] = None,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Proxy-signing requests (Admin and office bearers)."""
    return service.list_proxy_requests(session, current_user, status)


@router.post("/proxy-requests/{request_id}/authorise", response_model=ProxyRequestOut)
def authorise_proxy_request(
    request_id: UUID,
    body: ProxyAuthoriseRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """President / Treasurer / Secretary authorise (or decline) a proxy signature."""
    return service.authorise_proxy(
        session, background_tasks, request_id, current_user, body.approve, body.note
    )


@router.post("/proxy-requests/{request_id}/cancel", response_model=ProxyRequestOut)
def cancel_proxy_request(
    request_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    return service.cancel_proxy(session, request_id, current_user)


@router.post("/{policy_type}/{policy_id}/submit", response_model=SigningSummary)
def open_policy_for_signing(
    policy_type: PolicyType,
    policy_id: UUID,
    background_tasks: BackgroundTasks,
    body: Optional[OpenForSigningRequest] = None,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """Treasurer signs the draft (optionally with a hand signature) and opens it
    for every member to sign."""
    service.open_for_signing(
        session, background_tasks, policy_type, policy_id, current_user,
        signature_image=body.signature_image if body else None,
    )
    return service.summary(session, policy_type, policy_id, current_user)


@router.post("/{policy_type}/{policy_id}/withdraw", response_model=SigningSummary)
def withdraw_policy(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_policy_manager),
    session: Session = Depends(get_session),
):
    """Treasurer withdraws an open policy back to draft (clears signatures)."""
    service.withdraw(session, policy_type, policy_id, current_user)
    return service.summary(session, policy_type, policy_id, current_user)


@router.get("/{policy_type}/{policy_id}/signatures", response_model=SigningSummary)
def get_policy_signatures(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Signing progress, with each member's name, date and decision."""
    return service.summary(session, policy_type, policy_id, current_user)


@router.post("/deposit/statement-preview", response_model=StatementPreview)
def preview_deposit_statement(
    body: DepositPolicyCreate,
    current_user: User = Depends(get_current_policy_manager),
):
    """The generated English and Nepali wording for a deposit policy form
    (nothing is saved)."""
    policy = DepositPolicy(**body.model_dump(exclude={"statement_en", "statement_ne"}))
    return StatementPreview(
        statement_en=policy_document.policy_statement("deposit", policy),
        statement_ne=policy_document.policy_statement_ne("deposit", policy),
    )


@router.post("/loan/statement-preview", response_model=StatementPreview)
def preview_loan_statement(
    body: LoanPolicyCreate,
    current_user: User = Depends(get_current_policy_manager),
):
    """The generated English and Nepali wording for a loan policy form."""
    policy = LoanPolicy(**body.model_dump(exclude={"statement_en", "statement_ne"}))
    return StatementPreview(
        statement_en=policy_document.policy_statement("loan", policy),
        statement_ne=policy_document.policy_statement_ne("loan", policy),
    )


@router.get("/{policy_type}/{policy_id}/record/preview")
def preview_policy_record(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """While signing is open: the record as it would look now (signatures so
    far), watermarked PREVIEW and not stored."""
    from fastapi import Response

    policy = service.get_policy(session, policy_type, policy_id)
    service.close_if_due(session, None, policy_type, policy)
    data = policy_document.build_preview(session, policy_type, policy)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="A preview is available while the policy is open for signing.")
    return Response(
        data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="policy-preview.pdf"', "Cache-Control": "no-store"},
    )


@router.get("/{policy_type}/{policy_id}/record")
def download_policy_record(
    policy_type: PolicyType,
    policy_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """The policy's adoption record (PDF on letterhead). Any member may download
    it (policies are shared by the whole group). Created on first request for
    policies adopted before records existed."""
    policy = service.get_policy(session, policy_type, policy_id)
    service.close_if_due(session, None, policy_type, policy)
    record = policy_document.ensure_record(session, policy_type, policy)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A record is created once the policy has been adopted.",
        )
    path = document_storage.path_for(record.file_key)
    if path is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="The record file is missing from storage.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{record.reference.replace('/', '-')}.pdf",
    )


@router.post("/{policy_type}/{policy_id}/sign", response_model=SigningSummary)
def sign_policy(
    policy_type: PolicyType,
    policy_id: UUID,
    body: SignRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Approve (sign) or reject an open policy. You can change your response
    while the policy is open."""
    return service.sign(
        session, background_tasks, policy_type, policy_id, current_user, body.decision, body.reason,
        signature_image=body.signature_image,
    )


@router.get("/{policy_type}/{policy_id}/signatures/{user_id}/image")
def get_signature_image(
    policy_type: PolicyType,
    policy_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """A member's hand signature on this policy (signatures are visible to all
    members, like the decisions themselves)."""
    from sqlmodel import select
    from app.models.policy.policy_signature import PolicySignature

    service.get_policy(session, policy_type, policy_id)
    row = session.exec(
        select(PolicySignature).where(
            PolicySignature.policy_type == policy_type,
            PolicySignature.policy_id == policy_id,
            PolicySignature.user_id == user_id,
        )
    ).first()
    path = document_storage.path_for(row.signature_file_key) if row and row.signature_file_key else None
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hand signature on file.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "private, max-age=300"})


@router.post("/{policy_type}/{policy_id}/proxy-requests", response_model=ProxyRequestOut)
def create_proxy_request(
    policy_type: PolicyType,
    policy_id: UUID,
    body: ProxyRequestCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session),
):
    """Admin requests to sign on behalf of an absent member (after consulting
    them). Applied only once the President, Treasurer and Secretary authorise it."""
    return service.create_proxy_request(
        session, background_tasks, policy_type, policy_id, current_user,
        body.signer_user_id, body.decision, body.reason, body.consultation_note,
    )
