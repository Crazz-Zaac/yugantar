/*
 * Dates and times, the same for every member wherever they are.
 *
 * The API stores and sends UTC ("2026-11-11T09:30:00Z"). Everything is shown
 * and entered in the cooperative's timezone, Nepal Time (NPT, UTC+5:45), never
 * in the browser's own timezone, so every member sees the same date and time.
 * Nepal has no daylight saving time.
 *
 * To use another zone, change DISPLAY_TIME_ZONE and TIME_ZONE_LABEL; every
 * helper below (display and inputs) follows it.
 */

export const DISPLAY_TIME_ZONE = "Asia/Kathmandu"
export const TIME_ZONE_LABEL = "NPT"

const LOCALE = "en-GB" // "11 Nov 2026", 24-hour clock

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
})

const shortDateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
})

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

// Numeric wall-clock parts in DISPLAY_TIME_ZONE (for inputs and offsets)
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

function zoneParts(d: Date): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of partsFormat.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value)
  }
  return out
}

/** Offset of DISPLAY_TIME_ZONE from UTC at instant `d`, in ms (NPT: +5:45). */
function zoneOffsetMs(d: Date): number {
  const p = zoneParts(d)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** Parse an API timestamp. A value without an offset is treated as UTC. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)
  const d = new Date(value.includes("T") && !hasZone ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "11 Nov 2026" (in NPT) */
export function formatDate(value: string | null | undefined): string {
  const d = parseUtc(value)
  return d ? dateFormat.format(d) : "—"
}

/** "11 Nov" (in NPT) */
export function formatShortDate(value: string | null | undefined): string {
  const d = parseUtc(value)
  return d ? shortDateFormat.format(d) : "—"
}

/** "11 Nov 2026, 15:15 NPT" */
export function formatDateTime(value: string | null | undefined): string {
  const d = parseUtc(value)
  return d ? `${dateFormat.format(d)}, ${timeFormat.format(d)} ${TIME_ZONE_LABEL}` : "—"
}

// ─── <input type="datetime-local"> values, in NPT ───────────────────────────

const pad = (n: number) => String(n).padStart(2, "0")

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in NPT, for a datetime-local input. */
export function toZoneInputValue(value: string | null | undefined): string {
  const d = parseUtc(value)
  if (!d) return ""
  const p = zoneParts(d)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** "YYYY-MM-DDTHH:mm" entered in NPT -> ISO timestamp in UTC ("...Z"). */
export function fromZoneInputValue(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return null
  const wallAsUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const d = new Date(wallAsUtc - zoneOffsetMs(new Date(wallAsUtc)))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Current time as a datetime-local value (NPT). */
export function nowZoneInputValue(): string {
  return toZoneInputValue(new Date().toISOString())
}
