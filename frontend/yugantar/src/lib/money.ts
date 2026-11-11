// Nepali rupees, grouped the way members read them: Rs. 1,00,000

const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

/** "Rs. 1,00,000" / "Rs. 4,450.50" */
export function formatRs(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return `Rs. ${Number.isInteger(n) ? whole.format(n) : full.format(n)}`
}

/** Short form for charts and tight spaces: "Rs 950", "Rs 12K", "Rs 4.2L", "Rs 1.5Cr" */
export function formatRsCompact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, "")
  if (abs >= 1e7) return `Rs ${trim(n / 1e7)}Cr`
  if (abs >= 1e5) return `Rs ${trim(n / 1e5)}L`
  if (abs >= 1e3) return `Rs ${trim(n / 1e3)}K`
  return `Rs ${whole.format(n)}`
}

/** "2026-03" -> "Mar" (or "Mar 26" with year) */
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number)
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]
  return withYear ? `${name} ${String(y).slice(2)}` : name
}
