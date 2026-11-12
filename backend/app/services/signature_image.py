"""
Hand-written signature images (drawn on screen or a photo of a signature).

The browser sends a data URL (PNG/JPEG/WebP). We decode it with Pillow, make
the paper background transparent (so a photo of a signature on white paper
works), crop to the ink, limit the size, and store a clean PNG in the private
document storage. The PNG is then printed in PDF records.
"""

import base64
import binascii
import io
import re

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.document_storage import document_storage

MAX_DATA_URL_CHARS = 2_000_000  # ~1.5 MB image
MAX_SIZE = (900, 300)  # px, after cropping
_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", re.DOTALL)


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def clean_signature_png(data_url: str) -> bytes:
    """Decode, validate and normalise a signature image to a cropped PNG."""
    if len(data_url) > MAX_DATA_URL_CHARS:
        raise _bad("The signature image is too large (max about 1.5 MB).")
    match = _DATA_URL.match(data_url.strip())
    if not match:
        raise _bad("The signature must be a PNG, JPEG or WebP image.")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (binascii.Error, UnidentifiedImageError, OSError, ValueError):
        raise _bad("The signature image could not be read.")
    if img.width * img.height > 25_000_000:
        raise _bad("The signature image is too large.")

    img = ImageOps.exif_transpose(img).convert("RGBA")
    # Background to transparent: light pixels (paper) become clear
    gray = img.convert("L")
    alpha = img.getchannel("A")
    ink = gray.point(lambda v: 255 if v < 200 else (0 if v > 235 else int((235 - v) * 255 / 35)))
    mask = Image.composite(ink, Image.new("L", img.size, 0), alpha)
    img.putalpha(mask)

    box = mask.getbbox()
    if not box:
        raise _bad("The signature is empty. Please draw or upload your signature.")
    w, h = box[2] - box[0], box[3] - box[1]
    if w < 20 or h < 8:
        raise _bad("The signature is too small. Please sign larger.")
    pad = 8
    img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    img.thumbnail(MAX_SIZE, Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def save_signature(data_url: str) -> tuple[str, str]:
    """Store a cleaned signature; returns (file_key, sha256)."""
    return document_storage.save(clean_signature_png(data_url), prefix="signatures", suffix=".png")


def delete_signature(file_key: str | None) -> None:
    if not file_key:
        return
    path = document_storage.path_for(file_key)
    if path:
        path.unlink(missing_ok=True)
