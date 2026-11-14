"""
Bikram Sambat (BS) dates.

The month-length table is the one the frontend's date picker uses (the
patrojs package, pinned in frontend/yugantar/package.json), so a BS date in
an email or PDF is always the same as on screen. One digit per month: days
minus 28, for BS 1978–2099. BS 1978-01-01 = AD 1921-04-13.

When patrojs is upgraded, regenerate this table from it (see
ProjectJournal.md, entry 32) and run the calendar tests.
"""

from datetime import date
from typing import NamedTuple

FIRST_YEAR = 1978
ANCHOR = date.fromisoformat("1921-04-13")
_TABLE = (
    "334333212122334432212122343432221123333433122122334333212122334432212122"
    "343432221123333433122122334333212122343432212122343432221123333433212122"
    "334333212122343432212122343432221213333433212122334333212122343432221122"
    "343432221213334333212122334333212122343432221123243432221213334333212122"
    "334432212122343432221123243432221213334333212122334432212122343432221123"
    "333433122113334333212122334432212122343432221123333433122122334333212122"
    "334432212122343432221123333433122122334333212122343432212122343432221213"
    "333433212122334333212122343432221122343432221213333433212122334333212122"
    "343432221123243432221213334333212122334342212122343432221123243432221213"
    "334333212122334432212122343432221123243433122113334333212122334432212122"
    "343432221123333433122122334333212122334432212122343432221123333433122122"
    "334333212122343432212122343432221123333433212122334333212122343432221122"
    "343432221213333433212122334333212122343432221122343432221213334333212122"
    "334342212122343432221123243432221213334333212122334432212122343432221123"
    "243433121213334333212122334432212122343432221123333433122113334333212122"
    "334432212122343432221123333433122122334333212122343432212122343432221123"
    "333433212122334333212122343432221122343432221213333433212122334333212122"
    "343432221122343432221213334333212122334333212122343432221123243432221213"
    "334333212122334432212122343432221123243432221213334333212122334432212122"
    "343432221123333433122113334333212122334432212122343432221123333433122122"
    "334333212122343432221123"
)
LAST_YEAR = FIRST_YEAR + len(_TABLE) // 12 - 1

# Nepali month names (same spellings as frontend/yugantar/src/lib/bs.ts)
BS_MONTHS = ["वैशाख", "जेष्ठ", "असार", "श्रावण", "भदौ", "आश्विन", "कार्तिक", "मंसिर", "पौष", "माघ", "फाल्गुण", "चैत्र"]


class BsDate(NamedTuple):
    year: int
    month: int  # 1–12
    day: int


def month_length(year: int, month: int) -> int:
    i = (year - FIRST_YEAR) * 12 + (month - 1)
    if not 0 <= i < len(_TABLE):
        raise ValueError(f"BS {year}-{month:02d} is outside the supported range")
    return 28 + int(_TABLE[i])


def ad_to_bs(value: date) -> BsDate:
    """An AD calendar date as a BS date (ValueError outside BS 1978–2099)."""
    days = (value - ANCHOR).days
    if days < 0:
        raise ValueError(f"{value} is before BS {FIRST_YEAR}")
    for i, digit in enumerate(_TABLE):
        length = 28 + int(digit)
        if days < length:
            return BsDate(FIRST_YEAR + i // 12, i % 12 + 1, days + 1)
        days -= length
    raise ValueError(f"{value} is after BS {LAST_YEAR}")


def bs_to_ad(year: int, month: int, day: int) -> date:
    if not 1 <= day <= month_length(year, month):
        raise ValueError(f"BS {year}-{month:02d}-{day:02d} is not a valid date")
    from datetime import timedelta

    days = sum(28 + int(c) for c in _TABLE[: (year - FIRST_YEAR) * 12 + month - 1]) + day - 1
    return ANCHOR + timedelta(days=days)
