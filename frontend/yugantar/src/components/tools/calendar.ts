import { apiClient } from "@/api/api"
import { downloadFile } from "@/lib/download"
import { t } from "@/lib/i18n"
import { addDays, dayKey, dayStartIso, formatDate, formatTime, parseUtc, TIME_ZONE_LABEL } from "@/lib/datetime"

export type ItemKind = "event" | "deposit_due" | "loan_maturity" | "policy_deadline"
export type Category = "meeting" | "general_assembly" | "holiday" | "notice" | "other" | "personal" | "due_date"
export type Rsvp = "going" | "maybe" | "declined"
export type Recurrence = "none" | "weekly" | "monthly"
/** "private" = a personal event: only the member who added it sees it */
export type Visibility = "members" | "office_bearers" | "private"

export interface CalendarItem {
  id: string
  kind: ItemKind
  event_id: string | null
  title: string
  description: string | null
  category: Category
  visibility: Visibility
  start: string
  end: string
  all_day: boolean
  location: string | null
  is_online: boolean
  recurrence: Recurrence
  repeat_until: string | null
  series_start: string | null
  series_end: string | null
  cancelled: boolean
  organizer_name: string | null
  rsvp: { going: number; maybe: number; declined: number } | null
  my_response: Rsvp | null
  join_from: string | null
  join_until: string | null
  link: string | null
  can_edit: boolean
}

export interface CalendarFeed {
  items: CalendarItem[]
  can_manage: boolean
  meetings_enabled: boolean
}

export interface JoinInfo {
  domain: string
  room: string
  jwt: string
  moderator: boolean
  title: string
  display_name: string
  ends_at: string
}

export interface EventPayload {
  title: string
  description: string | null
  category: Exclude<Category, "due_date" | "personal">
  visibility: Visibility
  start_at: string
  end_at: string
  all_day: boolean
  location: string | null
  recurrence: Recurrence
  repeat_until: string | null
  is_online: boolean
  notify: boolean
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function fetchFeed(
  start: string,
  end: string,
  opts: { online?: boolean; dueDates?: boolean } = {},
): Promise<CalendarFeed> {
  const res = await apiClient.get("/calendar/events", {
    params: { start, end, online: opts.online ?? false, due_dates: opts.dueDates ?? true },
  })
  return res.data as CalendarFeed
}

export const fetchUpcoming = async (limit = 5): Promise<CalendarFeed> =>
  (await apiClient.get("/calendar/upcoming", { params: { limit } })).data as CalendarFeed

export const createEvent = (p: EventPayload) => apiClient.post("/calendar/events", p)
export const updateEvent = (id: string, p: EventPayload) => apiClient.put(`/calendar/events/${id}`, p)
export const cancelEvent = (id: string) => apiClient.post(`/calendar/events/${id}/cancel`)
export const deletePersonalEvent = (id: string) => apiClient.delete(`/calendar/events/${id}`)
export const meetNow = (title: string, visibility: Visibility, minutes = 60) =>
  apiClient.post("/calendar/meet-now", { title: title || null, visibility, minutes })
export const setRsvp = (item: CalendarItem, response: Rsvp) =>
  apiClient.put(`/calendar/events/${item.event_id}/rsvp`, { occurrence_start: item.start, response })
export const fetchRsvpPeople = async (item: CalendarItem): Promise<{ name: string; response: Rsvp }[]> =>
  (await apiClient.get(`/calendar/events/${item.event_id}/rsvps`, { params: { occurrence: item.start } })).data
export const joinMeeting = async (item: CalendarItem): Promise<JoinInfo> =>
  (await apiClient.post(`/calendar/events/${item.event_id}/join`, null, { params: { occurrence: item.start } })).data
export const downloadIcs = (item: CalendarItem) =>
  downloadFile(
    `/calendar/events/${item.event_id}/ics`,
    `yugantar-${item.title.replace(/[^\w-]+/g, "-").slice(0, 40)}.ics`,
  )

// ─── Presentation ───────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<Category, string> = {
  meeting: "Meeting",
  general_assembly: "General assembly",
  holiday: "Holiday",
  notice: "Notice",
  other: "Event",
  personal: "Personal",
  due_date: "Due date",
}

/** Chip colours per category (light + dark). */
export const CATEGORY_STYLE: Record<Category, { chip: string; dot: string; bar: string }> = {
  meeting: {
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
    dot: "bg-sky-500",
    bar: "border-l-sky-500",
  },
  general_assembly: {
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200",
    dot: "bg-violet-500",
    bar: "border-l-violet-500",
  },
  holiday: {
    chip: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200",
    dot: "bg-rose-500",
    bar: "border-l-rose-500",
  },
  notice: {
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
    dot: "bg-amber-500",
    bar: "border-l-amber-500",
  },
  other: {
    chip: "bg-slate-100 text-slate-900 dark:bg-slate-500/20 dark:text-slate-200",
    dot: "bg-slate-500",
    bar: "border-l-slate-500",
  },
  personal: {
    chip: "bg-teal-100 text-teal-900 dark:bg-teal-500/15 dark:text-teal-200",
    dot: "bg-teal-500",
    bar: "border-l-teal-500",
  },
  due_date: {
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
    dot: "bg-emerald-500",
    bar: "border-l-emerald-500",
  },
}

/** NPT calendar days an item covers (all-day: [start, end); timed: start…end). */
export function itemDays(item: CalendarItem): string[] {
  const first = dayKey(item.start)
  const endDate = parseUtc(item.end)
  const startDate = parseUtc(item.start)
  if (!endDate || !startDate) return [first]
  const lastInstant = item.all_day || endDate > startDate ? new Date(endDate.getTime() - 1) : endDate
  const last = dayKey(lastInstant)
  const days = [first]
  let k = first
  while (k < last && days.length < 15) {
    k = addDays(k, 1)
    days.push(k)
  }
  return days
}

/** "15:00–16:00", "All day", "Closes 23:59". */
export function timeLabel(item: CalendarItem): string {
  if (item.all_day) return t("All day")
  if (item.start === item.end) return t("Closes {0}", formatTime(item.start))
  return `${formatTime(item.start)}–${formatTime(item.end)}`
}

/** Full "when" line for details. */
export function whenLabel(item: CalendarItem): string {
  const days = itemDays(item)
  const from = formatDate(item.start)
  if (item.all_day) {
    const to = formatDate(dayStartIso(days[days.length - 1]))
    return days.length > 1 ? `${from} – ${to} · ${t("All day")}` : `${from} · ${t("All day")}`
  }
  if (item.start === item.end) return `${from} · ${t("Closes {0}", formatTime(item.start))} ${TIME_ZONE_LABEL}`
  const sameDay = days.length === 1
  return sameDay
    ? `${from} · ${formatTime(item.start)}–${formatTime(item.end)} ${TIME_ZONE_LABEL}`
    : `${from} ${formatTime(item.start)} – ${formatDate(item.end)} ${formatTime(item.end)} ${TIME_ZONE_LABEL}`
}

export type JoinState = "open" | "soon" | "ended" | "none"

/** Can the Join button be used now? */
export function joinState(item: CalendarItem, now = Date.now()): JoinState {
  if (!item.is_online || item.cancelled || !item.join_from || !item.join_until) return "none"
  const from = parseUtc(item.join_from)!.getTime()
  const until = parseUtc(item.join_until)!.getTime()
  if (now < from) return "soon"
  if (now > until) return "ended"
  return "open"
}

export function isLive(item: CalendarItem, now = Date.now()): boolean {
  const s = parseUtc(item.start)?.getTime() ?? 0
  const e = parseUtc(item.end)?.getTime() ?? 0
  return !item.cancelled && now >= s && now <= e
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
