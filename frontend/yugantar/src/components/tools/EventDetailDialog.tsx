import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Clock,
  HelpCircle,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Repeat,
  Trash2,
  User,
  Users,
  Video,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useConfirm } from "@/components/confirm/confirmContext"
import { apiError } from "@/components/policies/signing"
import { cn } from "@/lib/utils"
import { formatDate, formatTime } from "@/lib/datetime"
import {
  cancelEvent,
  CATEGORY_LABEL,
  deletePersonalEvent,
  CATEGORY_STYLE,
  downloadIcs,
  fetchRsvpPeople,
  joinState,
  setRsvp,
  whenLabel,
  type CalendarItem,
  type Rsvp,
} from "./calendar"

const RSVP_OPTIONS: { value: Rsvp; label: string; icon: typeof Check }[] = [
  { value: "going", label: "Going", icon: Check },
  { value: "maybe", label: "Maybe", icon: HelpCircle },
  { value: "declined", label: "Can't go", icon: X },
]

interface Props {
  item: CalendarItem | null
  onClose: () => void
  onChanged: () => void
  onEdit: (item: CalendarItem) => void
  onJoin: (item: CalendarItem) => void
  joining: boolean
}

export function EventDetailDialog({ item, onClose, onChanged, onEdit, onJoin, joining }: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      {item && (
        <EventDetail
          key={item.id}
          item={item}
          onClose={onClose}
          onChanged={onChanged}
          onEdit={onEdit}
          onJoin={onJoin}
          joining={joining}
        />
      )}
    </Dialog>
  )
}

function EventDetail({ item, onClose, onChanged, onEdit, onJoin, joining }: Props & { item: CalendarItem }) {
  const [, navigate] = useLocation()
  const confirm = useConfirm()
  const [mine, setMine] = useState<Rsvp | null>(item.my_response)
  const [counts, setCounts] = useState(item.rsvp ?? { going: 0, maybe: 0, declined: 0 })
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<{ name: string; response: Rsvp }[] | null>(null)
  const [showPeople, setShowPeople] = useState(false)

  const isEvent = item.kind === "event"
  const personal = item.visibility === "private"
  const past = new Date(item.end).getTime() < Date.now()
  const join = joinState(item)
  const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.other

  useEffect(() => {
    if (!showPeople || !isEvent) return
    let cancelled = false
    fetchRsvpPeople(item)
      .then((p) => !cancelled && setPeople(p))
      .catch(() => !cancelled && setPeople([]))
    return () => {
      cancelled = true
    }
  }, [showPeople, isEvent, item, counts])

  const reply = async (value: Rsvp) => {
    if (value === mine) return
    setBusy(true)
    try {
      await setRsvp(item, value)
      setCounts((c) => {
        const next = { ...c, [value]: c[value] + 1 }
        if (mine) next[mine] = Math.max(0, next[mine] - 1)
        return next
      })
      setMine(value)
      onChanged()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't save your reply.")))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const yes = await confirm({
      title: t("Delete this event?"),
      description: t("It's removed from your calendar. This can't be undone."),
      confirmLabel: t("Delete"),
      cancelLabel: t("Keep it"),
      destructive: true,
    })
    if (!yes.confirmed || !item.event_id) return
    setBusy(true)
    try {
      await deletePersonalEvent(item.event_id)
      toast.success(t("Event deleted"))
      onChanged()
      onClose()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't delete the event.")))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    const yes = await confirm({
      title: t("Cancel this event?"),
      description:
        item.recurrence !== "none"
          ? t("Every repetition is cancelled and members who can see it are notified. This can't be undone.")
          : t("Members who can see it are notified. This can't be undone."),
      confirmLabel: t("Cancel event"),
      cancelLabel: t("Keep it"),
      destructive: true,
    })
    if (!yes.confirmed || !item.event_id) return
    setBusy(true)
    try {
      await cancelEvent(item.event_id)
      toast.success(t("Event cancelled"))
      onChanged()
      onClose()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't cancel the event.")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader className="text-left">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className={cn("border-0", style.chip)}>
            {t(CATEGORY_LABEL[item.category] ?? "Event")}
          </Badge>
          {item.is_online && (
            <Badge variant="outline" className="gap-1">
              <Video className="h-3 w-3" />
              {t("Online")}
            </Badge>
          )}
          {item.visibility !== "members" && item.kind === "event" && (
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" />
              {item.visibility === "private" ? t("Only you") : t("Office bearers only")}
            </Badge>
          )}
          {item.cancelled && <Badge variant="destructive">{t("Cancelled")}</Badge>}
        </div>
        <DialogTitle className={cn("text-lg leading-snug", item.cancelled && "line-through opacity-70")}>
          {item.title}
        </DialogTitle>
        <DialogDescription className="sr-only">{whenLabel(item)}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 text-sm">
        <Row icon={Clock}>{whenLabel(item)}</Row>
        {item.recurrence !== "none" && (
          <Row icon={Repeat}>
            {item.recurrence === "weekly" ? t("Every week") : t("Every month")}
            {item.repeat_until ? ` · ${t("until {0}", formatDate(item.repeat_until))}` : ""}
          </Row>
        )}
        {item.location && <Row icon={MapPin}>{item.location}</Row>}
        {item.organizer_name && <Row icon={User}>{t("Organised by {0}", item.organizer_name)}</Row>}
        {item.description && (
          <p className="whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] leading-relaxed text-foreground">
            {item.description}
          </p>
        )}
      </div>

      {/* Online meeting */}
      {item.is_online && !item.cancelled && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          {join === "open" ? (
            <Button className="w-full" onClick={() => onJoin(item)} disabled={joining}>
              {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
              {t("Join meeting")}
            </Button>
          ) : (
            <p className="text-center text-xs text-sky-900 dark:text-sky-200">
              {join === "soon"
                ? t(
                    "You can join from {0}, 15 minutes before it starts.",
                    `${formatDate(item.join_from)} ${formatTime(item.join_from)}`,
                  )
                : t("This meeting has ended.")}
            </p>
          )}
        </div>
      )}

      {/* Replies */}
      {isEvent && !personal && !item.cancelled && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{past ? t("Replies") : t("Are you coming?")}</p>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPeople((v) => !v)}
            >
              <Users className="h-3.5 w-3.5" />
              {t("{0} going · {1} maybe · {2} can't", counts.going, counts.maybe, counts.declined)}
            </button>
          </div>
          {!past && (
            <div className="grid grid-cols-3 gap-2">
              {RSVP_OPTIONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={mine === value ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => reply(value)}
                  aria-pressed={mine === value}
                >
                  <Icon className="mr-1 h-3.5 w-3.5" />
                  {t(label)}
                </Button>
              ))}
            </div>
          )}
          {showPeople && (
            <div className="max-h-40 overflow-y-auto rounded-lg border px-3 py-2 text-xs">
              {people === null ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
              ) : people.length === 0 ? (
                <p className="text-muted-foreground">{t("No replies yet.")}</p>
              ) : (
                <ul className="grid gap-1">
                  {people.map((p) => (
                    <li key={p.name} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {t(RSVP_OPTIONS.find((o) => o.value === p.response)?.label ?? "")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <Separator />
      <div className="flex flex-wrap gap-2">
        {item.link && (
          <Button
            size="sm"
            onClick={() => {
              onClose()
              navigate(item.link!)
            }}
          >
            {item.kind === "deposit_due"
              ? t("Go to Deposits")
              : item.kind === "loan_maturity"
                ? t("Go to Loans")
                : t("Go to Policies")}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
        {isEvent && !item.cancelled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadIcs(item).catch(() => toast.error(t("Download failed.")))}
          >
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            {t("Add to my phone calendar")}
          </Button>
        )}
        {item.can_edit && (
          <>
            <Button size="sm" variant="outline" onClick={() => onEdit(item)} disabled={busy}>
              <Pencil className="mr-1.5 h-4 w-4" />
              {t("Edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={personal ? remove : cancel}
              disabled={busy}
            >
              {personal ? <Trash2 className="mr-1.5 h-4 w-4" /> : <XCircle className="mr-1.5 h-4 w-4" />}
              {personal ? t("Delete") : t("Cancel event")}
            </Button>
          </>
        )}
      </div>
    </DialogContent>
  )
}

function Row({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  )
}
