import { getLang, neDigits, t } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { adToBs, bsMonthLength, bsToAd, BS_MONTHS } from "@/lib/bs"
import {
  addDays,
  dayKey,
  dayStartIso,
  formatDate,
  formatShortDate,
  formatTime,
  keyParts,
  makeKey,
  weekdayOf,
  TIME_ZONE_LABEL,
} from "@/lib/datetime"
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  fetchFeed,
  itemDays,
  WEEKDAYS,
  type CalendarFeed,
  type CalendarItem,
} from "./calendar"
import { EventDetailDialog } from "./EventDetailDialog"
import { EventFormDialog } from "./EventFormDialog"
import { ItemRow } from "./ItemRow"
import { useJoinMeeting } from "./useJoinMeeting"

type View = "month" | "week" | "agenda"
const VIEW_KEY = "yugantar.calendarView"
const DUE_KEY = "yugantar.calendarDueDates"

const readPref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })
const keyDate = (key: string) => {
  const { year, month, day } = keyParts(key)
  return new Date(Date.UTC(year, month - 1, day))
}

/** The days a view shows: [first, last] plus the "home" month for greying. */
function period(view: View, anchor: string, ne: boolean) {
  if (view === "week") {
    const first = addDays(anchor, -weekdayOf(anchor))
    return { first, last: addDays(first, 6), inMonth: () => true }
  }
  if (view === "agenda") return { first: anchor, last: addDays(anchor, 30), inMonth: () => true }
  // month
  let monthFirst: string, monthLast: string
  if (ne) {
    const bs = adToBs(keyParts(anchor).year, keyParts(anchor).month, keyParts(anchor).day)!
    const ad = bsToAd(bs.year, bs.month, 1)
    monthFirst = makeKey(ad.year, ad.month, ad.day)
    monthLast = addDays(monthFirst, bsMonthLength(bs.year, bs.month) - 1)
  } else {
    const { year, month } = keyParts(anchor)
    monthFirst = makeKey(year, month, 1)
    monthLast = makeKey(year, month + 1, 0)
  }
  return {
    first: addDays(monthFirst, -weekdayOf(monthFirst)),
    last: addDays(monthLast, 6 - weekdayOf(monthLast)),
    inMonth: (k: string) => k >= monthFirst && k <= monthLast,
  }
}

function shift(view: View, anchor: string, dir: number, ne: boolean): string {
  if (view === "week") return addDays(anchor, 7 * dir)
  if (view === "agenda") return addDays(anchor, 30 * dir)
  if (ne) {
    const { year, month, day } = keyParts(anchor)
    const bs = adToBs(year, month, day)!
    let m = bs.month + dir,
      y = bs.year
    if (m < 1) [m, y] = [12, y - 1]
    if (m > 12) [m, y] = [1, y + 1]
    const ad = bsToAd(y, m, 1)
    return makeKey(ad.year, ad.month, ad.day)
  }
  const { year, month } = keyParts(anchor)
  return makeKey(year, month + dir, 1)
}

function title(view: View, anchor: string, first: string, last: string, ne: boolean): { main: string; sub?: string } {
  if (view === "month") {
    if (ne) {
      const { year, month, day } = keyParts(anchor)
      const bs = adToBs(year, month, day)!
      const a = keyDate(addDays(first, 7)),
        b = keyDate(addDays(last, -7))
      return {
        main: `${BS_MONTHS[bs.month - 1]} ${neDigits(String(bs.year))}`,
        sub: `${shortMonth.format(a)} – ${shortMonth.format(b)} ${b.getUTCFullYear()}`,
      }
    }
    return { main: monthFormat.format(keyDate(anchor)) }
  }
  return { main: `${formatShortDate(dayStartIso(first))} – ${formatDate(dayStartIso(last))}` }
}

export function CalendarTab() {
  const ne = getLang() === "ne"
  const today = dayKey(new Date())
  const [view, setView] = useState<View>(() => readPref(VIEW_KEY, "month") as View)
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [showDue, setShowDue] = useState(() => readPref(DUE_KEY, "1") === "1")
  const [feed, setFeed] = useState<CalendarFeed | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openItem, setOpenItem] = useState<CalendarItem | null>(null)
  const [form, setForm] = useState<{ open: boolean; editing?: CalendarItem | null; day?: string | null }>({
    open: false,
  })
  const { join, joiningId, room } = useJoinMeeting()

  const { first, last, inMonth } = useMemo(() => period(view, anchor, ne), [view, anchor, ne])

  // The range being shown; "loading" until its data has arrived
  const requestKey = `${first}|${last}|${showDue}|${reloadKey}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== requestKey

  useEffect(() => {
    let cancelled = false
    fetchFeed(dayStartIso(first), dayStartIso(addDays(last, 1)), { dueDates: showDue })
      .then((f) => {
        if (cancelled) return
        setFeed(f)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoadedKey(requestKey))
    return () => {
      cancelled = true
    }
  }, [first, last, showDue, reloadKey, requestKey])

  // Items per NPT day
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of feed?.items ?? []) {
      for (const k of itemDays(item)) {
        if (k < first || k > last) continue
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(item)
      }
    }
    return map
  }, [feed, first, last])

  const days = useMemo(() => {
    const out: string[] = []
    for (let k = first; k <= last && out.length < 50; k = addDays(k, 1)) out.push(k)
    return out
  }, [first, last])

  const reload = () => setReloadKey((k) => k + 1)
  const addOn = (k: string) => setForm({ open: true, day: k })
  // Click a date to add an event on it. On phones (small cells with dots)
  // the first tap shows that day's events below; tapping it again adds.
  const onDayClick = (k: string) => {
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
    if (wide || k === selected) addOn(k)
    setSelected(k)
  }
  const changeView = (v: View) => {
    if (!v) return
    setView(v)
    writePref(VIEW_KEY, v)
    if (v === "agenda") setAnchor(today)
  }
  const go = (dir: number) => setAnchor((a) => shift(view, a, dir, ne))
  const goToday = () => {
    setAnchor(today)
    setSelected(today)
  }
  const head = title(view, anchor, first, last, ne)
  const canManage = feed?.can_manage ?? false
  const selectedItems = byDay.get(selected) ?? []

  const dayNumber = (k: string) => {
    const { year, month, day } = keyParts(k)
    if (!ne) return { main: String(day), sub: null }
    const bs = adToBs(year, month, day)
    return { main: bs ? neDigits(String(bs.day)) : String(day), sub: String(day) }
  }
  const weekdayLabel = (i: number) => t(WEEKDAYS[i])

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("Today")}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => go(-1)} aria-label={t("Previous")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => go(1)} aria-label={t("Next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mr-auto min-w-0">
          <h2 className="flex items-center gap-2 truncate text-base font-semibold text-foreground sm:text-lg">
            {head.main}
            {loading && feed && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </h2>
          {head.sub && <p className="text-[11px] text-muted-foreground">{head.sub}</p>}
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => changeView(v as View)}
          variant="outline"
          size="sm"
          className="order-last w-full sm:order-none sm:w-auto"
        >
          <ToggleGroupItem value="month" className="flex-1 px-3 sm:flex-none">
            {t("Month")}
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="flex-1 px-3 sm:flex-none">
            {t("Week")}
          </ToggleGroupItem>
          <ToggleGroupItem value="agenda" className="flex-1 px-3 sm:flex-none">
            {t("Agenda")}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={() => setForm({ open: true, day: view === "month" ? selected : null })}>
          <Plus className="mr-1.5 h-4 w-4" />
          {canManage ? t("New event") : t("Personal event")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("Times in {0}", TIME_ZONE_LABEL)}</span>
        <div className="flex items-center gap-2">
          <Label htmlFor="cal-due" className="text-xs font-normal">
            {t("Show due dates")}
          </Label>
          <Switch
            id="cal-due"
            checked={showDue}
            onCheckedChange={(v) => {
              setShowDue(v)
              writePref(DUE_KEY, v ? "1" : "0")
            }}
          />
        </div>
      </div>

      {error && !feed ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm">{t("Couldn't load the calendar.")}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("Try again")}
            </Button>
          </CardContent>
        </Card>
      ) : view === "month" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Month grid */}
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAYS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "py-2 text-center text-[11px] font-medium text-muted-foreground",
                    i === 6 && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {weekdayLabel(i)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((k) => {
                const items = byDay.get(k) ?? []
                const num = dayNumber(k)
                const isToday = k === today
                const isSel = k === selected
                const saturday = weekdayOf(k) === 6
                const holiday = items.some((i) => i.category === "holiday" && !i.cancelled)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onDayClick(k)}
                    title={t("Add an event on this day")}
                    className={cn(
                      "group relative flex min-h-[3.25rem] flex-col items-stretch gap-0.5 border-b border-r p-1 text-left transition-colors last:border-r-0 sm:min-h-[6.5rem] sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                      !inMonth(k) && "bg-muted/30 text-muted-foreground/60",
                      isSel ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/40" : "hover:bg-muted/40",
                    )}
                    aria-label={formatDate(dayStartIso(k))}
                    aria-pressed={isSel}
                  >
                    <span className="flex items-baseline justify-center gap-1 sm:justify-between">
                      <span
                        className={cn(
                          "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium sm:text-[13px]",
                          isToday && "bg-primary text-primary-foreground",
                          !isToday && (saturday || holiday) && inMonth(k) && "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {num.main}
                      </span>
                      <span className="hidden items-center gap-1 sm:flex">
                        <Plus className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                        {num.sub && <span className="text-[10px] text-muted-foreground">{num.sub}</span>}
                      </span>
                    </span>
                    {/* Phones: dots */}
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((i) => (
                        <span
                          key={i.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            (CATEGORY_STYLE[i.category] ?? CATEGORY_STYLE.other).dot,
                            i.cancelled && "opacity-40",
                          )}
                        />
                      ))}
                    </span>
                    {/* Larger screens: chips */}
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {items.slice(0, 3).map((i) => (
                        <span
                          key={i.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelected(k)
                            setOpenItem(i)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation()
                              setOpenItem(i)
                            }
                          }}
                          className={cn(
                            "truncate rounded px-1.5 py-0.5 text-[11px] leading-tight",
                            (CATEGORY_STYLE[i.category] ?? CATEGORY_STYLE.other).chip,
                            i.cancelled && "line-through opacity-60",
                          )}
                          title={i.title}
                        >
                          {!i.all_day && i.start !== i.end && dayKey(i.start) === k && (
                            <span className="mr-1 opacity-70">{formatTime(i.start)}</span>
                          )}
                          {i.title}
                        </span>
                      ))}
                      {items.length > 3 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelected(k)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation()
                              setSelected(k)
                            }
                          }}
                          className="rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {t("+{0} more", items.length - 3)}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Selected day */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{formatDate(dayStartIso(selected))}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setForm({ open: true, day: selected })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("Add")}
              </Button>
            </div>
            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                <CalendarDays className="h-5 w-5" />
                {t("Nothing on this day.")}
              </div>
            ) : (
              selectedItems.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={setOpenItem} onJoin={join} joining={joiningId === i.id} />
              ))
            )}
          </div>
        </div>
      ) : (
        // Week and Agenda: days with their events
        <div className={cn(view === "week" && "grid gap-3 lg:grid-cols-7 lg:gap-2")}>
          {days
            .filter((k) => view === "week" || (byDay.get(k)?.length ?? 0) > 0)
            .map((k) => {
              const items = byDay.get(k) ?? []
              const isToday = k === today
              return (
                <div
                  key={k}
                  className={cn("flex flex-col gap-1.5", view === "agenda" && "mb-4", view === "week" && "lg:min-h-40")}
                >
                  <div
                    className={cn(
                      "flex items-baseline gap-2 border-b pb-1 lg:flex-col lg:items-start lg:gap-0",
                      view === "agenda" && "lg:flex-row lg:items-baseline lg:gap-2",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium uppercase text-muted-foreground",
                        weekdayOf(k) === 6 && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {weekdayLabel(weekdayOf(k))}
                    </span>
                    <span className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-foreground")}>
                      {formatShortDate(dayStartIso(k))}
                      {isToday && <span className="ml-1.5 text-[11px] font-normal">({t("Today")})</span>}
                    </span>
                  </div>
                  {items.map((i) => (
                    <ItemRow key={i.id} item={i} onOpen={setOpenItem} onJoin={join} joining={joiningId === i.id} />
                  ))}
                  {view === "week" && (
                    <button
                      type="button"
                      onClick={() => addOn(k)}
                      className="flex items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary lg:flex-1"
                      aria-label={t("Add an event on {0}", formatDate(dayStartIso(k)))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("Add")}
                    </button>
                  )}
                </div>
              )
            })}
          {view === "agenda" && feed && byDay.size === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              <CalendarDays className="h-6 w-6" />
              {t("Nothing in the next 30 days.")}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(["meeting", "general_assembly", "holiday", "notice", "personal", "due_date"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", CATEGORY_STYLE[c].dot)} />
            {t(CATEGORY_LABEL[c])}
          </span>
        ))}
      </div>

      <EventDetailDialog
        item={openItem}
        onClose={() => setOpenItem(null)}
        onChanged={reload}
        onEdit={(i) => {
          setOpenItem(null)
          setForm({ open: true, editing: i })
        }}
        onJoin={(i) => {
          setOpenItem(null)
          join(i)
        }}
        joining={joiningId !== null}
      />
      <EventFormDialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        editing={form.editing}
        day={form.day}
        canPublish={canManage}
        meetingsEnabled={feed?.meetings_enabled ?? false}
        onSaved={reload}
      />
      {room}
    </div>
  )
}
