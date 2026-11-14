"""
Official reports (PDF on the letterhead) that members generated.

Every generation is a snapshot with its own reference number
(YUG/FS/2026/0001, YUG/AR/2026/0001): figures can change later (e.g. a deposit verified
afterwards), so a report is never regenerated in place. The PDF is kept in
document storage with its SHA-256.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from app.models.base import BaseModel


class GeneratedReport(BaseModel, table=True):
    __tablename__ = "generated_report"
    __table_args__ = {"extend_existing": True}

    kind: str = Field(max_length=40, index=True)  # "financial_statement" | "accrual_report"
    reference: str = Field(max_length=40, unique=True, index=True)
    # Days covered, "YYYY-MM-DD" (inclusive, Nepal time)
    period_from: str = Field(max_length=10)
    period_to: str = Field(max_length=10)
    generated_by: uuid.UUID = Field(index=True)
    generated_by_name: str = Field(max_length=200)
    generated_at: datetime
    file_key: str = Field(max_length=300)
    sha256: str = Field(max_length=64)
    size_bytes: int = Field(default=0)
