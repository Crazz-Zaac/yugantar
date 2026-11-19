import { n, t } from "@/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Send, Trash2, Vote as VoteIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DateTimeField } from "@/components/DateField"
import { apiError } from "@/components/policies/signing"
import { formatDate, fromZoneInputValue, nowZoneInputValue, toZoneInputValue, TIME_ZONE_LABEL } from "@/lib/datetime"
import { cn } from "@/lib/utils"
import { fetchFeed, type CalendarItem } from "./calendar"
import {
  createMinutes,
  fetchDirectory,
  prefillMinutes,
  submitMinutes,
  updateMinutes,
  voteResult,
  VOTE_CATEGORIES,
  type AgendaItem,
  type Minutes,
  type MinutesPayload,
  type VoteCategory,
} from "./minutes"

/*
 * Write or edit meeting minutes in the standard format: the meeting, who
 * attended, each agenda item (what was discussed, what was concluded, and
 * an optional vote), and any other business. Save as a draft, or save and
 * submit to the President for approval. Shown as a page in the Minutes tab
 * (it's a long form), in place of the list or the opened minutes.
 */

const emptyItem = (): AgendaItem => ({ title: "", discussion: "", decision: "", vote: null })

export function MinutesEditor({
  editing,
  onClose,
  onSaved,
}: {
  editing: Minutes | null
  onClose: () => void
  onSaved: (m: Minutes) => void
}) {
  const [members, setMembers] = useState<{ id: string; name: string; roles: string[] }[]>([])
  const [meetings, setMeetings] = useState<CalendarItem[]>([])
  const [title, setTitle] = useState(editing?.title ?? "")
  const [type, setType] = useState<"online" | "in_person">(editing?.meeting_type ?? "in_person")
  const [heldAt, setHeldAt] = useState(editing ? toZoneInputValue(editing.held_at) : nowZoneInputValue())
  const [location, setLocation] = useState(editing?.location ?? "")
  const [eventId, setEventId] = useState<string | null>(editing?.event_id ?? null)
  const [chairedBy, setChairedBy] = useState(editing?.chaired_by ?? "")
  const [attendees, setAttendees] = useState<Set<string>>(new Set(editing?.attendees.map((a) => a.id) ?? []))
  const [guests, setGuests] = useState(editing?.guests ?? "")
  const [agenda, setAgenda] = useState<AgendaItem[]>(
    editing
      ? editing.agenda.map((i) => ({
          title: i.title,
          discussion: i.discussion ?? "",
          decision: i.decision ?? "",
          vote: i.vote
            ? {
                category: i.vote.category,
                votes_for: i.vote.votes_for,
                votes_against: i.vote.votes_against,
                abstained: i.vote.abstained,
              }
            : null,
        }))
      : [emptyItem()],
  )
  const [otherBusiness, setOtherBusiness] = useState(editing?.other_business ?? "")
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null)
  const top = useRef<HTMLDivElement>(null)
  // The dashboard's scroll area keeps its position when this page replaces the list
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchDirectory()
      .then((d) => {
        if (cancelled) return
        setMembers(d)
        // Default chair: the President
        const president = d.find((m) => m.roles.includes("president"))
        if (president) setChairedBy((c) => c || `${president.name} (President)`)
      })
      .catch(() => {})
    // Recent meetings on the calendar (last 90 days) to fill the details from
    const now = Date.now()
    fetchFeed(new Date(now - 90 * 86_400_000).toISOString(), new Date(now + 86_400_000).toISOString(), {
      dueDates: false,
    })
      .then((f) => {
        if (cancelled) return
        setMeetings(
          f.items
            .filter((i) => i.kind === "event" && !i.cancelled && ["meeting", "general_assembly"].includes(i.category))
            .filter((i) => new Date(i.start).getTime() <= now)
            .reverse(),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const fromMeeting = async (id: string) => {
    const item = meetings.find((m) => m.id === id)
    if (!item?.event_id) return
    try {
      const p = await prefillMinutes(item.event_id, item.start)
      setTitle(p.title)
      setType(p.meeting_type)
      setHeldAt(toZoneInputValue(p.held_at))
      setLocation(p.location ?? "")
      setEventId(p.event_id)
      if (p.suggested_attendee_ids.length) setAttendees(new Set(p.suggested_attendee_ids))
      toast.success(t('Filled in from the calendar; attendees suggested from "Going" replies.'))
    } catch (err) {
      toast.error(apiError(err, t("Couldn't load that meeting.")))
    }
  }

  const present = attendees.size
  const setItem = (i: number, patch: Partial<AgendaItem>) =>
    setAgenda((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, dir: number) =>
    setAgenda((a) => {
      const b = [...a]
      const [x] = b.splice(i, 1)
      b.splice(i + dir, 0, x)
      return b
    })

  const problems = useMemo(() => {
    const out: string[] = []
    if (title.trim().length < 2) out.push(t("Give the meeting a title."))
    if (chairedBy.trim().length < 2) out.push(t("Say who chaired the meeting."))
    if (!fromZoneInputValue(heldAt)) out.push(t("Choose when the meeting was held."))
    agenda.forEach((a, i) => {
      if (a.title.trim().length < 2) out.push(t("Agenda item {0} needs a title.", i + 1))
      if (a.vote && a.vote.votes_for + a.vote.votes_against + a.vote.abstained > present)
        out.push(t("Agenda item {0} has more votes than members present.", i + 1))
    })
    return out
  }, [title, chairedBy, heldAt, agenda, present])

  const payload = (): MinutesPayload => ({
    title: title.trim(),
    meeting_type: type,
    held_at: fromZoneInputValue(heldAt) as string,
    location: location.trim() || null,
    event_id: eventId,
    chaired_by: chairedBy.trim(),
    attendee_ids: [...attendees],
    guests: guests.trim() || null,
    agenda: agenda
      .filter((a) => a.title.trim())
      .map((a) => ({
        title: a.title.trim(),
        discussion: a.discussion?.trim() || null,
        decision: a.decision?.trim() || null,
        vote: a.vote,
      })),
    other_business: otherBusiness.trim() || null,
  })

  const save = async (submit: boolean) => {
    if (problems.length) return
    setSaving(submit ? "submit" : "draft")
    try {
      let m = editing ? await updateMinutes(editing.id, payload()) : await createMinutes(payload())
      if (submit) m = await submitMinutes(m.id)
      toast.success(submit ? t("Submitted to the President for approval") : t("Draft saved"))
      onSaved(m)
    } catch (err) {
      toast.error(apiError(err, t("Couldn't save the minutes.")))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div ref={top} className="mx-auto flex w-full max-w-3xl scroll-mt-4 flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving !== null} className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {editing ? t("Back to the minutes") : t("All minutes")}
        </Button>
        <h2 className="mt-2 text-lg font-semibold">{editing ? t("Edit minutes") : t("Write minutes")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "The record of the meeting: who attended, what was discussed, what was concluded and how each resolution was voted.",
          )}
        </p>
      </div>
      {editing?.return_note && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t("Returned by {0}: {1}", editing.reviewed_by_name ?? "", editing.return_note)}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {/* 1. The meeting */}
        <section className="grid gap-4">
          <h4 className="text-sm font-semibold">{t("1. The meeting")}</h4>
          {meetings.length > 0 && (
            <div className="grid gap-1.5">
              <Label>{t("From a calendar meeting (optional)")}</Label>
              <Select onValueChange={fromMeeting}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Choose a past meeting to fill in the details")} />
                </SelectTrigger>
                <SelectContent>
                  {meetings.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {formatDate(m.start)} · {m.title}
                      {m.is_online ? ` · ${t("Online")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="mn-title">{t("Title")}</Label>
            <Input
              id="mn-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("e.g. Annual General Meeting 2083")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t("Held")}</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={type}
                onValueChange={(v) => v && setType(v as typeof type)}
              >
                <ToggleGroupItem value="in_person" className="flex-1">
                  {t("In person")}
                </ToggleGroupItem>
                <ToggleGroupItem value="online" className="flex-1">
                  {t("Online")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mn-when">{t("When ({0})", TIME_ZONE_LABEL)}</Label>
              <DateTimeField
                id="mn-when"
                value={heldAt}
                max={nowZoneInputValue()}
                onChange={(v) => v && setHeldAt(v)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mn-place">{t("Place (optional)")}</Label>
              <Input id="mn-place" value={location} maxLength={255} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mn-chair">{t("Chaired by")}</Label>
              <Input id="mn-chair" value={chairedBy} maxLength={200} onChange={(e) => setChairedBy(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 2. Attendance */}
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              {t("2. Attendance")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("{0} of {1} members present", present, members.length)}
              </span>
            </h4>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setAttendees(new Set(members.map((m) => m.id)))}
              >
                {t("Select all")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setAttendees(new Set())}
              >
                {t("Clear")}
              </Button>
            </div>
          </div>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={attendees.has(m.id)}
                  onCheckedChange={(v) =>
                    setAttendees((s) => {
                      const next = new Set(s)
                      if (v) next.add(m.id)
                      else next.delete(m.id)
                      return next
                    })
                  }
                />
                {m.name}
              </label>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mn-guests">{t("Also present, not members (optional)")}</Label>
            <Input
              id="mn-guests"
              value={guests}
              maxLength={500}
              onChange={(e) => setGuests(e.target.value)}
              placeholder={t("e.g. the auditor")}
            />
          </div>
        </section>

        {/* 3. Agenda */}
        <section className="grid gap-3">
          <h4 className="text-sm font-semibold">{t("3. Agenda and proceedings")}</h4>
          {agenda.map((item, i) => {
            const result = item.vote ? voteResult(item.vote) : null
            return (
              <div key={i} className="grid gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {n(i + 1)}
                  </span>
                  <Input
                    value={item.title}
                    maxLength={200}
                    onChange={(e) => setItem(i, { title: e.target.value })}
                    placeholder={t("Agenda item, e.g. Raise the monthly deposit")}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={t("Move up")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={i === agenda.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t("Move down")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={agenda.length === 1}
                    onClick={() => setAgenda((a) => a.filter((_, j) => j !== i))}
                    aria-label={t("Remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{t("What was discussed")}</Label>
                    <Textarea
                      rows={3}
                      maxLength={4000}
                      value={item.discussion ?? ""}
                      onChange={(e) => setItem(i, { discussion: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{t("What was concluded")}</Label>
                    <Textarea
                      rows={3}
                      maxLength={2000}
                      value={item.decision ?? ""}
                      onChange={(e) => setItem(i, { decision: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                  <Label className="flex items-center gap-1.5 text-xs font-normal">
                    <VoteIcon className="h-3.5 w-3.5" />
                    {t("Put to a vote")}
                  </Label>
                  <Switch
                    checked={!!item.vote}
                    onCheckedChange={(v) =>
                      setItem(i, {
                        vote: v ? { category: "policy", votes_for: 0, votes_against: 0, abstained: 0 } : null,
                      })
                    }
                  />
                </div>
                {item.vote && (
                  <div className="grid items-end gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("Type")}</Label>
                      <Select
                        value={item.vote.category}
                        onValueChange={(v) => setItem(i, { vote: { ...item.vote!, category: v as VoteCategory } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOTE_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {t(c.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(
                      [
                        ["votes_for", "For"],
                        ["votes_against", "Against"],
                        ["abstained", "Abstained"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="grid gap-1.5">
                        <Label className="text-xs">{t(label)}</Label>
                        <Input
                          type="number"
                          min={0}
                          className="font-nums h-9"
                          value={item.vote![key]}
                          onChange={(e) =>
                            setItem(i, {
                              vote: { ...item.vote!, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) },
                            })
                          }
                        />
                      </div>
                    ))}
                    <Badge
                      className={cn(
                        "mb-1 h-7 justify-center whitespace-nowrap border-0",
                        result?.passed
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200",
                      )}
                    >
                      {result?.passed ? (result.unanimous ? t("Passed (unanimous)") : t("Passed")) : t("Not passed")}
                    </Badge>
                  </div>
                )}
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setAgenda((a) => [...a, emptyItem()])}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("Add agenda item")}
          </Button>
        </section>

        {/* 4. Other business */}
        <section className="grid gap-1.5">
          <h4 className="text-sm font-semibold">{t("4. Any other business (optional)")}</h4>
          <Textarea
            rows={3}
            maxLength={4000}
            value={otherBusiness}
            onChange={(e) => setOtherBusiness(e.target.value)}
          />
        </section>

        {problems.length > 0 && (
          <ul className="list-disc rounded-lg bg-muted/50 py-2 pl-8 pr-3 text-xs text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={saving !== null}>
          {t("Cancel")}
        </Button>
        <Button variant="secondary" onClick={() => save(false)} disabled={problems.length > 0 || saving !== null}>
          {saving === "draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("Save draft")}
        </Button>
        <Button onClick={() => save(true)} disabled={problems.length > 0 || saving !== null}>
          {saving === "submit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {t("Submit for approval")}
        </Button>
      </div>
    </div>
  )
}
