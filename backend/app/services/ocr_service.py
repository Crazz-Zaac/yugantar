from pytesseract import Output   # type: ignore
import pytesseract
import cv2
import re
import logging

from app.utils.datetime_to_utc import parse_datetime_to_utc         

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _to_float(value):
    return float(value.replace(",", "")) if value else None


class OCRService:

    @staticmethod
    def _normalize_row_text(text: str) -> str:
        text = text.replace("\n", " ").replace("\r", "")
        text = " ".join(text.split())
        return text

    @staticmethod
    def extract_match(pattern: str, text: str):
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1) if match else None

    @staticmethod
    def extract_transaction_data(text: str) -> dict:
        text = re.sub(r"[|]", " ", text)

        ref_pattern = r"(?:Reference Code|Transaction Number|Transaction ID|TXN ID)\s*[:\-]?\s*([A-Za-z0-9\-_/]+)"
        amount_pattern = r"(?:Transaction Amount|Txn Amount|Total Amount|Amount|NPR)\s*(?:\([A-Z]{3}\))?\s*([\d,]+(?:\.\d{2})?)"
        charge_pattern = r"(?:Charge|Change)\s*(?:\([A-Z]{3}\))?\s*([\d,]+(?:\.\d{2})?)"

        label_based = r"(?:Payment Time|Date\s*/?\s*Time|Transaction Date)\s*[:\-]?\s*([0-9]{1,2}[-\s][A-Za-z]{3}[-\s][0-9]{4},?\s*[0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)"
        label_optional = r"\b([0-9]{1,2}[-/\.\s]?[A-Za-z]{3}[-/\.\s]?[0-9]{4},?\s*[0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)\b"

        amount = OCRService.extract_match(amount_pattern, text)
        charge = OCRService.extract_match(charge_pattern, text)
        reference = OCRService.extract_match(ref_pattern, text)

        date = OCRService.extract_match(label_based, text)
        if not date:
            date = OCRService.extract_match(label_optional, text)

        return {
            "amount": _to_float(amount),
            "charge": _to_float(charge),
            "date": parse_datetime_to_utc(date),
            "reference": reference,
        }

    @staticmethod
    def perform_ocr_on_image(image_path: str) -> dict:
        row_tolerance = 10
        lines: list = []
        details = {}

        try:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError("Image could not be read")

            gray_img = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            data = pytesseract.image_to_data(
                gray_img, config="--oem 3 --psm 6", output_type=Output.DICT
            )

        except Exception as e:
            logger.error(f"OCR failed for {image_path}: {e}")
            raise RuntimeError("OCR processing failed") from e

        # Group words into rows
        for i, txt in enumerate(data["text"]):
            if not txt.strip():
                continue
            y = data["top"][i]
            for row in lines:
                if abs(row["y"] - y) <= row_tolerance:
                    row["texts"].append(txt)
                    break
            else:
                lines.append({"y": y, "texts": [txt]})

        # Process each row
        for row in lines:
            row_text = " ".join(row["texts"])
            normalized = OCRService._normalize_row_text(row_text)

            extracted = OCRService.extract_transaction_data(normalized)
            for key, value in extracted.items():
                if value and key not in details:
                    details[key] = value

        return details
