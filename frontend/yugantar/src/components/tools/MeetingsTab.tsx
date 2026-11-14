import { t } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CalendarClock, History, Loader2, Plus, RefreshCw, ShieldCheck, Video, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiError } from "@/components/policies/signing"
import { formatShortDate } from "@/lib/datetime"
import {
  fetchFeed,
  isLive,
  joinState,
  meetNow,
  type CalendarFeed,
  type CalendarItem,
  type Visibility,
} from "./calendar"
import { EventDetailDialog } from "./EventDetailDialog"
import { EventFormDialog } from "./EventFormDialog"
import { ItemRow } from "./ItemRow"
import { useJoinMeeting } from "./useJoinMeeting"

const DAY = 86_400_000

export function MeetingsTab() {
  const [upcoming, setUpcoming] = useState<CalendarFeed | null>(null)
  const [past, setPast] = useState<CalendarItem[]>([])
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openItem, setOpenItem] = useState<CalendarItem | null>(null)
  const [form, setForm] = useState<{ open: boolean; editing?: CalendarItem | null }>({ open: false })
  const [title, setTitle] = useState("")
  const [audience, setAudience] = useState<Visibility>("members")
  const [starting, setStarting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const { join, joiningId, room } = useJoinMeeting()

  useEffect(() => {
    let cancelled = false
    const t0 = Date.now()
    Promise.all([
      fetchFeed(new Date(t0 - DAY).toISOString(), new Date(t0 + 60 * DAY).toISOString(), { online: true }),
      fetchFeed(new Date(t0 - 60 * DAY).toISOString(), new Date(t0).toISOString(), { online: true }),
    ])
      .then(([u, p]) => {
        if (cancelled) return
        setUpcoming(u)
        setPast(p.items)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Re-check every 30 s so Join buttons open on time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const reload = () => setReloadKey((k) => k + 1)

  const { open, later, recent } = useMemo(() => {
    const items = upcoming?.items ?? []
    const open = items.filter((i) => !i.cancelled && (joinState(i, now) === "open" || isLive(i, now)))
    const later = items.filter((i) => !open.includes(i) && new Date(i.end).getTime() > now)
    // Both ranges overlap by a day: keep each occurrence once
    const recent = [...new Map([...past, ...items].map((i) => [i.id, i])).values()]
      .filter((i) => new Date(i.end).getTime() <= now && !open.some((o) => o.id === i.id))
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 10)
    return { open, later, recent }
  }, [upcoming, past, now])

  const startNow = async () => {
    setStarting(true)
    try {
      const res = await meetNow(title.trim(), audience)
      setTitle("")
      const feed = await fetchFeed(new Date(Date.now() - DAY).toISOString(), new Date(Date.now() + DAY).toISOString(), {
        online: true,
      })
      setUpcoming((u) =>
        u
          ? {
              ...u,
              items: [
                ...u.items.filter((i) => i.event_id !== res.data.id),
                ...feed.items.filter((i) => i.event_id === res.data.id),
              ],
            }
          : feed,
      )
      const item = feed.items.find((i) => i.event_id === res.data.id)
      if (item) join(item)
      reload()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't start the meeting.")))
    } finally {
      setStarting(false)
    }
  }

  if (error && !upcoming) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{t("Couldn't load meetings.")}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("Try again")}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!upcoming) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const enabled = upcoming.meetings_enabled
  const canManage = upcoming.can_manage

  return (
    <div className="flex flex-col gap-6">
      {/* Start / schedule */}
      {canManage && (
        <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-transparent dark:border-sky-500/30 dark:from-sky-500/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Video className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              {t("Start or schedule a meeting")}
            </CardTitle>
            <CardDescription>
              {enabled
                ? t("Members are notified and join inside Yugantar. Office bearers join as hosts.")
                : t("Online meetings are not set up yet.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Meeting title (optional)")}
              maxLength={200}
              className="sm:flex-1"
              disabled={!enabled}
            />
            <Select value={audience} onValueChange={(v) => setAudience(v as Visibility)} disabled={!enabled}>
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="members">{t("All members")}</SelectItem>
                <SelectItem value="office_bearers">{t("Office bearers only")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={startNow} disabled={!enabled || starting} className="flex-1 sm:flex-none">
                {starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
                {t("Meet now")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setForm({ open: true })}
                disabled={!enabled}
                className="flex-1 sm:flex-none"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {t("Schedule")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Happening now */}
      {open.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t("Open now")}
          </h3>
          {open.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onOpen={setOpenItem}
              onJoin={join}
              joining={joiningId === i.id}
              showDate={formatShortDate(i.start)}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          {t("Upcoming")}
        </h3>
        {later.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            {t("No online meetings scheduled.")}
          </p>
        ) : (
          later.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={setOpenItem} onJoin={join} showDate={formatShortDate(i.start)} />
          ))
        )}
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History className="h-4 w-4 text-muted-foreground" />
            {t("Recent")}
          </h3>
          {recent.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={setOpenItem} showDate={formatShortDate(i.start)} />
          ))}
        </section>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        {t(
          "Meetings run on Jitsi (8x8). Only signed-in members who can see a meeting get a pass to join it; recording is turned off. Allow camera and microphone when your browser asks.",
        )}
      </p>

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
        online
        canPublish={canManage}
        meetingsEnabled={enabled}
        onSaved={reload}
      />
      {room}
    </div>
  )
}
