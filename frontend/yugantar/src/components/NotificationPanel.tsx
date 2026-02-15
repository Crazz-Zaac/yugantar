import { Bell, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState } from "react"

type Notification = {
  id: number
  title: string
  message: string
  type: "warning" | "success" | "info" | "destructive"
  time: string
  read: boolean
}

export function NotificationPanel({ notifications: initialNotifications }: { notifications: Notification[] }) {
  const [items, setItems] = useState(initialNotifications)
  const [open, setOpen] = useState(false)

  const unreadCount = items.filter((n) => !n.read).length

  const markAllRead = () => {
    setItems(items.map((n) => ({ ...n, read: true })))
  }

  const dismiss = (id: number) => {
    setItems(items.filter((n) => n.id !== id))
  }

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-warning" />
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-success" />
      case "destructive":
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      default:
        return <Info className="h-4 w-4 text-chart-2" />
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 px-4 py-3 transition-colors ${notification.read ? "bg-transparent" : "bg-accent/50"
                    }`}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(notification.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{notification.time}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
                    onClick={() => dismiss(notification.id)}
                    aria-label={`Dismiss notification: ${notification.title}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
