import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  Lock,
  MapPin,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatShortDate, formatTime } from "@/lib/datetime";
import {
  CATEGORY_STYLE,
  fetchUpcoming,
  isLive,
  joinState,
  type CalendarItem,
} from "./calendar";
import { useJoinMeeting } from "./useJoinMeeting";

/** Home: the next few things on the calendar (hidden when there are none). */
export function UpcomingCard() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const { join, joiningId, room } = useJoinMeeting();

  useEffect(() => {
    let cancelled = false;
    fetchUpcoming(4)
      .then(f => !cancelled && setItems(f.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  const openItem = (item: CalendarItem) =>
    navigate(
      item.kind === "event"
        ? item.is_online
          ? "/dashboard/meetings"
          : "/dashboard/calendar"
        : (item.link ?? "/dashboard/calendar")
    );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          {t("Coming up")}
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-normal text-muted-foreground">
            {items.length}
          </span>
        </CardTitle>
        <button
          type="button"
          onClick={() => navigate("/dashboard/calendar")}
          className="flex items-center gap-0.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {t("Calendar")}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent className="grid gap-x-3 p-1.5 sm:grid-cols-2">
        {items.map(i => (
          <CompactRow
            key={i.id}
            item={i}
            onOpen={openItem}
            onJoin={join}
            joining={joiningId === i.id}
          />
        ))}
      </CardContent>
      {room}
    </Card>
  );
}

/** A compact, borderless agenda row: category dot, title, a one-line meta, and Join when live. */
function CompactRow({
  item,
  onOpen,
  onJoin,
  joining,
}: {
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
  onJoin: (item: CalendarItem) => void;
  joining: boolean;
}) {
  const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.other;
  const live = isLive(item);
  const canJoin = joinState(item) === "open";

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/50",
        item.cancelled && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            style.dot,
            item.cancelled && "opacity-50"
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-1 text-[13px] font-medium leading-tight text-foreground",
              item.cancelled && "line-through"
            )}
          >
            {item.is_online && (
              <Video className="h-3 w-3 shrink-0 text-sky-600 dark:text-sky-400" />
            )}
            {item.visibility !== "members" && (
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{item.title}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-tight text-muted-foreground">
            {item.cancelled ? (
              <span className="font-medium text-destructive">
                {t("Cancelled")}
              </span>
            ) : live ? (
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {t("Happening now")}
              </span>
            ) : (
              <span className="shrink-0 font-medium text-foreground/70">
                {formatShortDate(item.start)}
              </span>
            )}
            {!item.cancelled && !live && !item.all_day && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="shrink-0">{formatTime(item.start)}</span>
              </>
            )}
            {item.location && (
              <>
                <MapPin className="ml-0.5 h-3 w-3 shrink-0" />
                <span className="truncate">{item.location}</span>
              </>
            )}
          </p>
        </div>
      </button>
      {canJoin && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 px-2"
          onClick={() => onJoin(item)}
          disabled={joining}
        >
          {joining ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Video className="h-3.5 w-3.5" />
          )}
          <span className="hidden text-xs sm:inline">{t("Join")}</span>
        </Button>
      )}
    </div>
  );
}
