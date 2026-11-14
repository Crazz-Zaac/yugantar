import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { ArrowRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShortDate } from "@/lib/datetime"
import { fetchUpcoming, type CalendarItem } from "./calendar"
import { ItemRow } from "./ItemRow"
import { useJoinMeeting } from "./useJoinMeeting"

/** Home: the next few things on the calendar (hidden when there are none). */
export function UpcomingCard() {
  const [, navigate] = useLocation()
  const [items, setItems] = useState<CalendarItem[]>([])
  const { join, joiningId, room } = useJoinMeeting()

  useEffect(() => {
    let cancelled = false
    fetchUpcoming(4)
      .then((f) => !cancelled && setItems(f.items))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          {t("Coming up")}
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/dashboard/calendar")}>
          {t("Calendar")}
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            showDate={formatShortDate(i.start)}
            onOpen={(item) =>
              navigate(
                item.kind === "event"
                  ? item.is_online
                    ? "/dashboard/meetings"
                    : "/dashboard/calendar"
                  : (item.link ?? "/dashboard/calendar"),
              )
            }
            onJoin={join}
            joining={joiningId === i.id}
          />
        ))}
      </CardContent>
      {room}
    </Card>
  )
}
