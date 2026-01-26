from pathlib import Path
import sys


sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.ocr_service import OCRService  # type: ignore


receipts_dir = Path(__file__).resolve().parent / "receipts"

# file_path = receipts_dir / "Screenshot_20251230-163701 - Rajendra Bhandari.jpg"
file_path = receipts_dir / "WhatsApp Image 2025-12-02 at 08.07.36.jpeg"

data = OCRService.perform_ocr_on_image(str(file_path))

print(data)