import { t } from "@/lib/i18n"
import { Check, HelpCircle, Loader2, Lock, MapPin, Repeat, Video, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CATEGORY_LABEL, CATEGORY_STYLE, isLive, joinState, timeLabel, type CalendarItem } from "./calendar"

const RSVP_ICON = { going: Check, maybe: HelpCircle, declined: X }

/** One event in a list: time, title, place, and a Join button when it's open. */
export function ItemRow({
  item,
  onOpen,
  onJoin,
  joining,
  showDate,
}: {
  item: CalendarItem
  onOpen: (item: CalendarItem) => void
  onJoin?: (item: CalendarItem) => void
  joining?: boolean
  /** Text shown above the time (e.g. the date, in lists spanning days) */
  showDate?: string
}) {
  const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.other
  const live = isLive(item)
  const canJoin = onJoin && joinState(item) === "open"
  const MyIcon = item.my_response ? RSVP_ICON[item.my_response] : null

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-l-4 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40",
        style.bar,
        item.cancelled && "opacity-60",
      )}
    >
      <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="w-[4.5rem] shrink-0 text-xs leading-tight text-muted-foreground">
          {showDate && <p className="font-medium text-foreground">{showDate}</p>}
          <p>{timeLabel(item)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium text-foreground",
              item.cancelled && "line-through",
            )}
          >
            {item.is_online && <Video className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />}
            {item.visibility !== "members" && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <span className="truncate">{item.title}</span>
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {item.cancelled ? (
              <span className="font-medium text-destructive">{t("Cancelled")}</span>
            ) : live ? (
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {t("Happening now")}
              </span>
            ) : (
              <span>{t(CATEGORY_LABEL[item.category] ?? "Event")}</span>
            )}
            {item.recurrence !== "none" && <Repeat className="h-3 w-3 shrink-0" aria-label={t("Repeats")} />}
            {item.location && (
              <>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.location}</span>
              </>
            )}
            {MyIcon && !item.cancelled && (
              <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 text-[10px]">
                <MyIcon className="h-3 w-3" />
              </span>
            )}
          </p>
        </div>
      </button>
      {canJoin && (
        <Button size="sm" className="shrink-0" onClick={() => onJoin(item)} disabled={joining}>
          {joining ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <Video className="h-4 w-4 sm:mr-1.5" />}
          <span className="hidden sm:inline">{t("Join")}</span>
        </Button>
      )}
    </div>
  )
}
