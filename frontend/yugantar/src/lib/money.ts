// Nepali rupees, grouped the way members read them: Rs. 1,00,000
// (in the Nepali interface: रु. १,००,०००)
import { getLang, neDigits } from "@/lib/i18n"

const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

/** "Rs. 1,00,000" / "Rs. 4,450.50" */
export function formatRs(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  const text = Number.isInteger(n) ? whole.format(n) : full.format(n)
  return getLang() === "ne" ? `रु. ${neDigits(text)}` : `Rs. ${text}`
}

/** Short form for charts and tight spaces: "Rs 950", "Rs 12K", "Rs 4.2L", "Rs 1.5Cr" */
export function formatRsCompact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, "")
  if (getLang() === "ne") {
    if (abs >= 1e7) return `रु ${neDigits(trim(n / 1e7))} करोड`
    if (abs >= 1e5) return `रु ${neDigits(trim(n / 1e5))} लाख`
    if (abs >= 1e3) return `रु ${neDigits(trim(n / 1e3))} हजार`
    return `रु ${neDigits(whole.format(n))}`
  }
  if (abs >= 1e7) return `Rs ${trim(n / 1e7)}Cr`
  if (abs >= 1e5) return `Rs ${trim(n / 1e5)}L`
  if (abs >= 1e3) return `Rs ${trim(n / 1e3)}K`
  return `Rs ${whole.format(n)}`
}

/** "2026-03" -> "Mar" (or "Mar 26" with year) */
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number)
  if (getLang() === "ne") {
    // Months are AD months (deposits follow the English calendar), named in Nepali
    const ne = ["जनवरी", "फेब्रुअरी", "मार्च", "अप्रिल", "मे", "जुन", "जुलाई", "अगस्ट", "सेप्टेम्बर", "अक्टोबर", "नोभेम्बर", "डिसेम्बर"][m - 1]
    return withYear ? `${ne} ${neDigits(String(y).slice(2))}` : ne
  }
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]
  return withYear ? `${name} ${String(y).slice(2)}` : name
}
