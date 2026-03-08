"""
Schemas for the smart-deposit workflow.

Flow:
  1. POST /deposits/preview  → DepositPreviewResponse   (read-only breakdown)
  2. User reviews / adjusts split allocations on the frontend
  3. POST /deposits/smart    → SmartDepositResponse      (creates all records)
"""

from __future__ import annotations

from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
import uuid


# ── Split-allocation categories ───────────────────────────────────────────────


class SplitCategory(str, Enum):
    """How excess amount can be allocated."""

    DEPOSIT = "deposit"  # the regular deposit amount
    FINE = "fine"  # late-deposit fine
    ADVANCE_DEPOSIT = "advance"  # advance deposit (extra deposit)
    LOAN_PRINCIPAL = "loan_principal"  # pay loan principal only
    LOAN_INTEREST = "loan_interest"  # pay loan interest only
    LOAN_RENEWAL = "loan_renewal"  # pay off remaining principal to close/renew loan


# ── Preview (step 1) ─────────────────────────────────────────────────────────


class DepositPreviewRequest(SQLModel):
    """Sent by the frontend after OCR completes."""

    policy_id: uuid.UUID
    ocr_amount: Decimal = Field(gt=0, description="Raw OCR amount in rupees")
    ocr_charge: Decimal = Field(
        default=Decimal(0), ge=0, description="Bank charge in rupees"
    )
    ocr_date: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Deposited date from OCR",
    )
    ocr_reference: Optional[str] = None


class LoanSummary(SQLModel):
    """Brief info about an active loan for the split UI."""

    loan_id: uuid.UUID
    principal_paisa: int
    accrued_interest_paisa: int
    total_paid_paisa: int
    outstanding_principal_paisa: int
    outstanding_interest_paisa: int
    interest_rate: Decimal


class SplitAllocation(SQLModel):
    """One row in the split breakdown (both preview and submit)."""

    category: SplitCategory
    label: str  # human-readable label for the UI
    amount_rupees: Decimal  # amount in rupees
    loan_id: Optional[uuid.UUID] = None  # only for loan categories
    editable: bool = False  # if the user can change this amount


class DepositPreviewResponse(SQLModel):
    """Returned by POST /deposits/preview."""

    # OCR inputs (echoed back)
    ocr_amount: Decimal
    ocr_charge: Decimal
    net_amount: Decimal  # ocr_amount - ocr_charge

    # Policy info
    required_deposit: Decimal  # policy amount in rupees
    due_date: datetime

    # Fine
    is_late: bool
    fine_amount: Decimal  # 0 if not late
    fine_percentage: float

    # After mandatory deductions: net_amount - fine - required_deposit
    excess_amount: Decimal  # >= 0 or < 0 (insufficient)
    is_insufficient: bool

    # Pre-computed allocations (user can adjust the editable ones)
    allocations: List[SplitAllocation]

    # Active loans for the user (so frontend can show loan split options)
    active_loans: List[LoanSummary]


# ── Submit (step 2) ──────────────────────────────────────────────────────────


class SmartDepositAllocation(SQLModel):
    """One allocation row submitted by the user."""

    category: SplitCategory
    amount_rupees: Decimal = Field(ge=0)
    loan_id: Optional[uuid.UUID] = None  # required for loan categories


class SmartDepositCreate(SQLModel):
    """Submitted by the frontend to finalise the deposit."""

    policy_id: uuid.UUID
    ocr_amount: Decimal = Field(gt=0)
    ocr_charge: Decimal = Field(default=Decimal(0), ge=0)
    ocr_date: datetime
    ocr_reference: Optional[str] = None
    receipt_screenshot: Optional[str] = None

    allocations: List[SmartDepositAllocation]


class SmartDepositResponse(SQLModel):
    """Returned after a successful smart deposit."""

    deposit_id: uuid.UUID
    deposit_amount_paisa: int
    deposit_type: str
    fine_id: Optional[uuid.UUID] = None
    fine_amount_paisa: int = 0
    loan_payment_ids: List[uuid.UUID] = []
    total_allocated_rupees: Decimal
    message: str
