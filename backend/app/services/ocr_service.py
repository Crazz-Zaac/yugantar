from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo
import logging
import re

import cv2
import numpy as np
import pytesseract

logger = logging.getLogger(__name__)

LOCAL_TZ = ZoneInfo("Asia/Kathmandu")
TESSERACT_CONFIG = "--oem 3 --psm 6"

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
        start=1,
    )
}

_NUM = r"(\d[\d,]*(?:\.\d{1,2})?)"

# Ordered by preference: the first pattern that matches wins.
# "Total Amount" (amount + bank charge) is deliberately never used: the
# cooperative receives the transaction amount, not what the sender paid.
_AMOUNT_PATTERNS = [
    rf"(?:Txn|Transaction)\s*Amount\s*(?:\(\s*NPR\s*\))?\s*[:\-]?\s*{_NUM}",
    rf"(?<!Total\s)Amount\s*\(\s*NPR\s*\)\s*[:\-]?\s*{_NUM}",
    rf"\bNPR\.?\s*{_NUM}",
]
_CHARGE_PATTERNS = [
    rf"\bCha[rn]ge\s*(?:\(\s*NPR\s*\))?\s*[:\-]?\s*{_NUM}",
]
_REFERENCE_PATTERNS = [
    r"(?:Reference\s*Code|Transaction\s*Number|Transaction\s*ID|TXN\s*ID)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{3,})",
]
# e.g. "29 Nov 2025,09:55", "28-Dec-2025,05:25", "1 Dec 2025, 1:49"
_DATE_RE = re.compile(
    r"\b(\d{1,2})[\s\-/.]*([A-Za-z]{3})[A-Za-z]*[\s\-/.,]*(\d{4})\s*,?\s*(\d{1,2}):(\d{2})",
    re.IGNORECASE,
)
# AM/PM right after the time, possibly wrapped onto the next line and even
# preceded by the row label (e.g. "02:40\nDate/Time PM").
_MERIDIEM_RE = re.compile(r"[\s,.]*(?:[A-Za-z/ ]{0,15}\s)?(AM|PM)\b", re.IGNORECASE)


class OCRService:
    """Extract amount, charge, date and reference from bank transfer receipts."""

    # ------------------------------------------------------------------
    # Image -> text
    # ------------------------------------------------------------------
    @staticmethod
    def _preprocess(gray: np.ndarray) -> np.ndarray:
        """Normalise a receipt screenshot for Tesseract.

        - dark-mode screenshots are inverted to dark-on-light
        - small images are upscaled (Tesseract wants ~30px glyphs)
        - table grid lines are erased; with them, Tesseract skips the cells
        """
        if gray.mean() < 110:
            gray = 255 - gray

        if gray.shape[1] < 1000:
            f = 1000 / gray.shape[1]
            gray = cv2.resize(gray, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)

        binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        span = gray.shape[1] // 8
        lines = cv2.morphologyEx(
            binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (span, 1))
        )
        lines |= cv2.morphologyEx(
            binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, span))
        )
        cleaned = gray.copy()
        cleaned[cv2.dilate(lines, np.ones((3, 3), np.uint8)) > 0] = 255
        return cleaned

    @staticmethod
    def _image_to_text(image: np.ndarray) -> str:
        return pytesseract.image_to_string(image, config=TESSERACT_CONFIG)

    # ------------------------------------------------------------------
    # Text -> fields
    # ------------------------------------------------------------------
    @staticmethod
    def _first_match(patterns: list[str], text: str) -> Optional[str]:
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def _to_float(value: Optional[str]) -> Optional[float]:
        if not value:
            return None
        try:
            number = float(value.replace(",", ""))
        except ValueError:
            return None
        return number if number > 0 else None

    @staticmethod
    def _extract_date(text: str) -> Optional[str]:
        """Return the transaction time as an ISO-8601 UTC string, or None."""
        for match in _DATE_RE.finditer(text):
            day, mon, year, hour, minute = match.groups()
            month = _MONTHS.get(mon[:3].lower())
            if not month:
                continue
            hour, minute = int(hour), int(minute)

            meridiem = _MERIDIEM_RE.match(text, match.end(), match.end() + 30)
            if meridiem:
                if not 1 <= hour <= 12:
                    continue
                is_pm = meridiem.group(1).upper() == "PM"
                hour = hour % 12 + (12 if is_pm else 0)

            try:
                local = datetime(int(year), month, int(day), hour, minute, tzinfo=LOCAL_TZ)
            except ValueError:
                continue
            return local.astimezone(ZoneInfo("UTC")).isoformat()
        return None

    @classmethod
    def extract_transaction_data(cls, text: str) -> dict:
        text = text.replace("|", " ")
        return {
            "amount": cls._to_float(cls._first_match(_AMOUNT_PATTERNS, text)),
            "charge": cls._to_float(cls._first_match(_CHARGE_PATTERNS, text)),
            "date": cls._extract_date(text),
            "reference": cls._first_match(_REFERENCE_PATTERNS, text),
        }

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    @classmethod
    def perform_ocr_on_image(cls, image_path: str) -> dict:
        """OCR a receipt image. Fields that can't be read are omitted."""
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Image could not be read")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Preprocessed pass first; the raw image fills any gaps (preprocessing
        # occasionally garbles a field the raw image reads fine).
        details: dict = {}
        for variant in (cls._preprocess(gray), gray):
            extracted = cls.extract_transaction_data(cls._image_to_text(variant))
            for key, value in extracted.items():
                if value is not None and key not in details:
                    details[key] = value
            if all(k in details for k in ("amount", "date", "reference")):
                break

        return details
