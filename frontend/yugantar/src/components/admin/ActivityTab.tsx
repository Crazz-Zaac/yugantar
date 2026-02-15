import { useState, useEffect } from "react"
import { CreditCard, Landmark, ArrowDownRight, AlertTriangle, Settings, DollarSign, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Activity {
  id: string
  user: string
  action: string
  type: "loan" | "deposit" | "payment" | "withdrawal" | "alert" | "system"
  amount: number
  timestamp: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function getActivityIcon(type: string) {
  switch (type) {
    case "loan":
      return <CreditCard className="h-4 w-4 text-chart-2" />
    case "deposit":
      return <Landmark className="h-4 w-4 text-success" />
    case "payment":
      return <DollarSign className="h-4 w-4 text-primary" />
    case "withdrawal":
      return <ArrowDownRight className="h-4 w-4 text-warning" />
    case "alert":
      return <AlertTriangle className="h-4 w-4 text-destructive" />
    default:
      return <Settings className="h-4 w-4 text-muted-foreground" />
  }
}

function getActivityBadge(type: string) {
  const map: Record<string, { label: string; className: string }> = {
    loan: { label: "Loan", className: "border-chart-2/30 bg-chart-2/10 text-chart-2" },
    deposit: { label: "Deposit", className: "border-success/30 bg-success/10 text-success" },
    payment: { label: "Payment", className: "border-primary/30 bg-primary/10 text-primary" },
    withdrawal: { label: "Withdrawal", className: "border-warning/30 bg-warning/10 text-warning" },
    alert: { label: "Alert", className: "border-destructive/30 bg-destructive/10 text-destructive" },
    system: { label: "System", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  }
  const item = map[type] || map.system
  return <Badge variant="outline" className={`text-[10px] ${item.className}`}>{item.label}</Badge>
}

export function ActivityTab() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [activityLog, setActivityLog] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchActivityLog()
  }, [])

  const fetchActivityLog = async () => {
    try {
      setLoading(true)
      // Replace with your actual backend API endpoint
      const response = await fetch("/api/activity-log")
      if (!response.ok) throw new Error("Failed to fetch activity log")
      const data = await response.json()
      setActivityLog(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      // Set empty array for now to avoid errors
      setActivityLog([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = activityLog.filter((a) => {
    const matchesSearch = a.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.action.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === "all" || a.type === typeFilter
    return matchesSearch && matchesType
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
          <p className="text-sm text-muted-foreground">Monitor all user activities and system events</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">Loading activity log...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
          <p className="text-sm text-muted-foreground">Monitor all user activities and system events</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <p className="text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
        <p className="text-sm text-muted-foreground">Monitor all user activities and system events</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col items-center p-4">
            <p className="font-nums text-2xl font-bold text-foreground">
              {activityLog.filter((a) => a.type === "deposit").length}
            </p>
            <p className="text-xs text-muted-foreground">Deposits Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4">
            <p className="font-nums text-2xl font-bold text-foreground">
              {activityLog.filter((a) => a.type === "loan").length}
            </p>
            <p className="text-xs text-muted-foreground">Loan Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4">
            <p className="font-nums text-2xl font-bold text-foreground">
              {activityLog.filter((a) => a.type === "payment").length}
            </p>
            <p className="text-xs text-muted-foreground">Payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4">
            <p className="font-nums text-2xl font-bold text-destructive">
              {activityLog.filter((a) => a.type === "alert").length}
            </p>
            <p className="text-xs text-muted-foreground">Alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
              <CardDescription>{filtered.length} events</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search activity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-56 pl-9 text-sm"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="deposit">Deposits</SelectItem>
                  <SelectItem value="loan">Loans</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                  <SelectItem value="withdrawal">Withdrawals</SelectItem>
                  <SelectItem value="alert">Alerts</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {filtered.map((event, index) => (
              <div
                key={event.id}
                className={`flex items-start gap-4 py-4 ${index < filtered.length - 1 ? "border-b" : ""
                  }`}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {getActivityIcon(event.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{event.user}</p>
                    {getActivityBadge(event.type)}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{event.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{event.timestamp}</p>
                </div>
                {event.amount > 0 && (
                  <p className="font-nums shrink-0 text-sm font-semibold text-foreground">
                    {formatCurrency(event.amount)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
