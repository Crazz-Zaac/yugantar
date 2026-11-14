/*
 * Bikram Sambat (BS) dates for the Nepali interface.
 *
 * Conversions come from patrojs (pinned in package.json), the same library
 * as the BS date pickers. The backend uses a copy of the same month-length
 * table (backend/app/utils/bs_calendar.py), so a date on screen, in an email
 * and in a PDF is always the same. Supported: BS 1978–2099 (AD 1921–2043).
 */

import { ad2Bs, bs2Ad, daysInBsMonth } from "patrojs/utils"

export const BS_MONTHS = ["वैशाख", "जेष्ठ", "असार", "श्रावण", "भदौ", "आश्विन", "कार्तिक", "मंसिर", "पौष", "माघ", "फाल्गुण", "चैत्र"]

export interface BsDate {
  year: number
  month: number // 1–12
  day: number
}

const pad = (n: number) => String(n).padStart(2, "0")
const parse = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number)
  return { year, month, day }
}

/** AD calendar date (year, month 1–12, day) -> BS date, or null outside the supported range. */
export function adToBs(year: number, month: number, day: number): BsDate | null {
  try {
    return parse(ad2Bs(`${year}-${pad(month)}-${pad(day)}`))
  } catch {
    return null
  }
}

/** Days in a BS month. */
export function bsMonthLength(year: number, month: number): number {
  try {
    return daysInBsMonth(year, month)
  } catch {
    return 30
  }
}

/** BS date -> AD calendar date (year, month 1–12, day). */
export function bsToAd(year: number, month: number, day: number): { year: number; month: number; day: number } {
  return parse(bs2Ad(`${year}-${pad(month)}-${pad(day)}`))
}
