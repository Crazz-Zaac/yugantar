import { t } from "@/lib/i18n"
import { useState } from "react"
import { Loader2, Lock, Video } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { apiError } from "@/components/policies/signing"
import { DateField, DateTimeField } from "@/components/DateField"
import { addDays, dayKey, fromZoneInputValue, toZoneInputValue, TIME_ZONE_LABEL } from "@/lib/datetime"
import {
  CATEGORY_LABEL,
  createEvent,
  updateEvent,
  type CalendarItem,
  type EventPayload,
  type Recurrence,
  type Visibility,
} from "./calendar"

type FormCategory = EventPayload["category"]
const CATEGORIES: FormCategory[] = ["meeting", "general_assembly", "holiday", "notice", "other"]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this event (its first occurrence's times are used for a series) */
  editing?: CalendarItem | null
  /** New event on this NPT day ("YYYY-MM-DD") */
  day?: string | null
  /** New online meeting */
  online?: boolean
  /** Office bearer: may add events for the cooperative (others only personal ones) */
  canPublish: boolean
  meetingsEnabled: boolean
  onSaved: () => void
}

function nextHour(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  return toZoneInputValue(d.toISOString()).slice(0, 14) + "00"
}

function plusMinutes(local: string, minutes: number): string {
  const iso = fromZoneInputValue(local)
  return iso ? toZoneInputValue(new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()) : local
}

function initial(props: Props) {
  const e = props.editing
  if (e) {
    // A repeating event is edited as a whole series (from its first date)
    const start = e.series_start ?? e.start
    const end = e.series_end ?? e.end
    const lastDay = e.all_day ? addDays(dayKey(end), -1) : dayKey(end)
    return {
      title: e.title,
      description: e.description ?? "",
      category: (e.category === "due_date" || e.category === "personal" ? "other" : e.category) as FormCategory,
      visibility: e.visibility,
      allDay: e.all_day,
      start: toZoneInputValue(start),
      end: toZoneInputValue(end),
      startDay: dayKey(start),
      endDay: lastDay,
      location: e.location ?? "",
      recurrence: e.recurrence,
      repeatUntil: e.repeat_until ? dayKey(e.repeat_until) : "",
      online: e.is_online,
    }
  }
  const start = props.day ? `${props.day}T10:00` : nextHour()
  return {
    title: "",
    description: "",
    category: "meeting" as FormCategory,
    visibility: (props.canPublish ? "members" : "private") as Visibility,
    allDay: false,
    start,
    end: plusMinutes(start, 60),
    startDay: start.slice(0, 10),
    endDay: start.slice(0, 10),
    location: "",
    recurrence: "none" as Recurrence,
    repeatUntil: "",
    online: Boolean(props.online && props.meetingsEnabled && props.canPublish),
  }
}

export function EventFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <EventForm {...props} />}
    </Dialog>
  )
}

function EventForm(props: Props) {
  const { editing, meetingsEnabled, canPublish, onOpenChange, onSaved } = props
  const [f, setF] = useState(() => initial(props))
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }))

  const startIso = f.allDay ? fromZoneInputValue(`${f.startDay}T00:00`) : fromZoneInputValue(f.start)
  const endIso = f.allDay
    ? fromZoneInputValue(`${addDays(f.endDay || f.startDay, 1)}T00:00`)
    : fromZoneInputValue(f.end)
  const timeError =
    !startIso || !endIso
      ? t("Choose a start and an end.")
      : new Date(endIso) <= new Date(startIso)
        ? t("The event must end after it starts.")
        : null
  const repeatError =
    f.recurrence !== "none" && f.repeatUntil && f.repeatUntil < (f.allDay ? f.startDay : f.start.slice(0, 10))
      ? t("The repeat end date must be after the first date.")
      : null
  const personal = f.visibility === "private"
  const valid = f.title.trim().length >= 2 && !timeError && !repeatError

  const save = async () => {
    if (!valid || !startIso || !endIso) return
    const payload: EventPayload = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      category: f.category,
      visibility: f.visibility,
      start_at: startIso,
      end_at: endIso,
      all_day: f.allDay,
      location: f.location.trim() || null,
      recurrence: f.recurrence,
      repeat_until: f.recurrence !== "none" && f.repeatUntil ? fromZoneInputValue(`${f.repeatUntil}T00:00`) : null,
      is_online: f.online && !f.allDay && !personal,
      notify: notify && !personal,
    }
    setSaving(true)
    try {
      if (editing?.event_id) await updateEvent(editing.event_id, payload)
      else await createEvent(payload)
      toast.success(editing ? t("Event updated") : payload.is_online ? t("Meeting scheduled") : t("Event added"))
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't save the event.")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {editing
            ? t("Edit event")
            : personal
              ? t("New personal event")
              : f.online
                ? t("Schedule a meeting")
                : t("New event")}
        </DialogTitle>
        <DialogDescription>
          {editing && editing.recurrence !== "none"
            ? t("Changes apply to every repetition of this event.")
            : personal
              ? t("Only you can see it. You get a reminder 30 minutes before. Times are in {0}.", TIME_ZONE_LABEL)
              : t("Members are notified in the app and by email. Times are in {0}.", TIME_ZONE_LABEL)}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ev-title">{t("Title")}</Label>
          <Input
            id="ev-title"
            value={f.title}
            maxLength={200}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("e.g. Monthly members' meeting")}
            autoFocus
          />
        </div>

        {canPublish ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t("Who can see it")}</Label>
              <Select value={f.visibility} onValueChange={(v) => set("visibility", v as Visibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="members">{t("All members")}</SelectItem>
                  <SelectItem value="office_bearers">{t("Office bearers only")}</SelectItem>
                  <SelectItem value="private">{t("Only me (personal)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!personal && (
              <div className="grid gap-1.5">
                <Label>{t("Type")}</Label>
                <Select value={f.category} onValueChange={(v) => set("category", v as FormCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(CATEGORY_LABEL[c])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t(
              "A personal event: only you can see it. Events for the whole cooperative are added by the office bearers.",
            )}
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <Label htmlFor="ev-allday" className="font-normal">
            {t("All day")}
          </Label>
          <Switch
            id="ev-allday"
            checked={f.allDay}
            onCheckedChange={(v) => setF((p) => ({ ...p, allDay: v, online: v ? false : p.online }))}
          />
        </div>

        {f.allDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ev-sd">{t("From")}</Label>
              <DateField
                id="ev-sd"
                value={f.startDay}
                onChange={(v) =>
                  v &&
                  setF((p) => ({
                    ...p,
                    startDay: v,
                    endDay: p.endDay < v ? v : p.endDay,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-ed">{t("To")}</Label>
              <DateField id="ev-ed" value={f.endDay} min={f.startDay} onChange={(v) => v && set("endDay", v)} />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ev-start">{t("Starts")}</Label>
              <DateTimeField
                id="ev-start"
                value={f.start}
                onChange={(value) => {
                  if (!value) return
                  setF((p) => {
                    // keep the same length when the start moves
                    const a = fromZoneInputValue(p.start),
                      b = fromZoneInputValue(p.end)
                    const minutes = a && b ? Math.max(15, (new Date(b).getTime() - new Date(a).getTime()) / 60_000) : 60
                    return { ...p, start: value, end: plusMinutes(value, minutes) }
                  })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-end">{t("Ends")}</Label>
              <DateTimeField id="ev-end" value={f.end} min={f.start} onChange={(v) => v && set("end", v)} />
            </div>
          </div>
        )}
        {timeError && f.title && <p className="-mt-2 text-xs text-destructive">{timeError}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t("Repeat")}</Label>
            <Select value={f.recurrence} onValueChange={(v) => set("recurrence", v as Recurrence)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Does not repeat")}</SelectItem>
                <SelectItem value="weekly">{t("Every week")}</SelectItem>
                <SelectItem value="monthly">{t("Every month")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {f.recurrence !== "none" && (
            <div className="grid gap-1.5">
              <Label htmlFor="ev-until">{t("Repeat until (optional)")}</Label>
              <DateField
                id="ev-until"
                clearable
                value={f.repeatUntil}
                min={f.allDay ? f.startDay : f.start.slice(0, 10)}
                onChange={(v) => set("repeatUntil", v)}
              />
            </div>
          )}
        </div>
        {repeatError && <p className="-mt-2 text-xs text-destructive">{repeatError}</p>}

        {!personal && (
          <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="ev-online" className="flex items-center gap-1.5 font-normal">
                <Video className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                {t("Online meeting")}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {!meetingsEnabled
                  ? t("Online meetings are not set up yet.")
                  : f.allDay
                    ? t("Not available for all-day events.")
                    : t("Members join inside Yugantar from 15 minutes before the start.")}
              </p>
            </div>
            <Switch
              id="ev-online"
              checked={f.online && !f.allDay}
              disabled={!meetingsEnabled || f.allDay}
              onCheckedChange={(v) => set("online", v)}
            />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="ev-loc">
            {f.online && !personal ? t("Place (optional, for people attending in person)") : t("Place (optional)")}
          </Label>
          <Input
            id="ev-loc"
            value={f.location}
            maxLength={255}
            onChange={(e) => set("location", e.target.value)}
            placeholder={t("e.g. Cooperative office")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ev-desc">{t("Details (optional)")}</Label>
          <Textarea
            id="ev-desc"
            rows={3}
            maxLength={2000}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("Agenda, what to bring…")}
          />
        </div>

        {!personal && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <Label htmlFor="ev-notify" className="font-normal">
              {editing ? t("Notify members if the time or place changes") : t("Notify members")}
            </Label>
            <Switch id="ev-notify" checked={notify} onCheckedChange={setNotify} />
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {t("Cancel")}
        </Button>
        <Button onClick={save} disabled={!valid || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? t("Save changes") : f.online && !f.allDay && !personal ? t("Schedule") : t("Add to calendar")}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
