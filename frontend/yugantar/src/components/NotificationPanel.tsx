import { Bell, AlertTriangle, CheckCircle2, Info, ShieldAlert, FileCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState, useEffect, useCallback } from "react"
import { apiClient } from "@/api/api"

interface ApiNotification {
  id: string
  user_id: string
  title: string
  message: string
  notification_type: string
  policy_id: string | null
  policy_type: string | null
  is_read: boolean
  created_at: string
}

export function NotificationPanel() {
  const [items, setItems] = useState<ApiNotification[]>([])
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.get("/notifications")
      setItems(res.data)
    } catch {
      // silently fail — header component
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Re-fetch when popover opens
  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  const unreadCount = items.filter((n) => !n.is_read).length

  const markAllRead = async () => {
    try {
      await apiClient.patch("/notifications/read-all")
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      // silent
    }
  }

  const markRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`)
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch {
      // silent
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "policy_approval":
        return <ShieldAlert className="h-4 w-4 text-warning" />
      case "policy_approved":
        return <CheckCircle2 className="h-4 w-4 text-success" />
      case "policy_rejected":
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      case "policy_finalized":
        return <FileCheck className="h-4 w-4 text-chart-2" />
      default:
        return <Info className="h-4 w-4 text-chart-2" />
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60_000)
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
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
                  className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-accent/30 ${notification.is_read ? "bg-transparent" : "bg-accent/50"
                    }`}
                  onClick={() => !notification.is_read && markRead(notification.id)}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(notification.notification_type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{formatTime(notification.created_at)}</p>
                  </div>
                  {!notification.is_read && (
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
