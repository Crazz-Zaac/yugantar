import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CreditCard, FileSignature, Landmark, RefreshCw, Search, UserPlus, Wallet } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/api/api"
import { formatDate, parseUtc, TIME_ZONE_LABEL } from "@/lib/datetime"
import { formatRs } from "@/lib/money"

// GET /dashboard/activity
type EventType = "member" | "deposit" | "loan" | "payment" | "policy"
interface ActivityEvent {
  at: string
  type: EventType
  actor: string
  action: string
  amount: number | string | null
  status: string | null
}

const TYPES: { id: EventType; label: string; icon: typeof Landmark; className: string }[] = [
  { id: "deposit", label: "Deposits", icon: Landmark, className: "bg-primary/10 text-primary" },
  { id: "loan", label: "Loans", icon: CreditCard, className: "bg-chart-2/10 text-chart-2" },
  { id: "payment", label: "Loan payments", icon: Wallet, className: "bg-chart-5/10 text-chart-5" },
  { id: "policy", label: "Policies", icon: FileSignature, className: "bg-warning/15 text-warning-foreground dark:text-warning" },
  { id: "member", label: "Members", icon: UserPlus, className: "bg-muted text-muted-foreground" },
]
const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t])) as Record<EventType, (typeof TYPES)[number]>

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hour12: false })

function statusClass(status: string | null) {
  if (status === "verified" || status === "approved") return "border-success/30 bg-success/10 text-success"
  if (status === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive"
  return "border-border bg-muted text-muted-foreground"
}

export function ActivityTab() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")
  const [type, setType] = useState<EventType | "all">("all")

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/dashboard/activity", { params: { limit: 500 } })
      .then((res) => !cancelled && setEvents(res.data as ActivityEvent[]))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    events?.forEach((e) => (c[e.type] = (c[e.type] ?? 0) + 1))
    return c
  }, [events])

  // Filter, then group by Nepal calendar day
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: { day: string; items: ActivityEvent[] }[] = []
    for (const e of events ?? []) {
      if (type !== "all" && e.type !== type) continue
      if (q && !`${e.actor} ${e.action}`.toLowerCase().includes(q)) continue
      const day = formatDate(e.at)
      if (out.at(-1)?.day !== day) out.push({ day, items: [] })
      out.at(-1)!.items.push(e)
    }
    return out
  }, [events, query, type])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Activity log</h2>
        <p className="text-sm text-muted-foreground">
          Registrations, deposits, loans, payments and policy signatures across the cooperative. Times in {TIME_ZONE_LABEL}.
        </p>
      </div>

      {/* Category counts double as filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(type === t.id ? "all" : t.id)}
            aria-pressed={type === t.id}
            className={`flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50 ${type === t.id ? "border-primary ring-1 ring-primary" : ""}`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.className}`}>
              <t.icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-nums text-lg font-semibold leading-tight">{events ? counts[t.id] ?? 0 : "–"}</span>
              <span className="block text-xs text-muted-foreground">{t.label}</span>
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">
              {type === "all" ? "All activity" : TYPE[type].label}
            </CardTitle>
            <CardDescription>{groups.reduce((n, g) => n + g.items.length, 0)} events</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9 text-sm" placeholder="Search by name or action" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm">Couldn't load the activity log.</p>
              <Button variant="outline" size="sm" onClick={() => { setError(false); setReloadKey((k) => k + 1) }}>
                <RefreshCw className="mr-2 h-4 w-4" /> Try again
              </Button>
            </div>
          ) : !events ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No activity matches.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.day}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.day}</h3>
                  <ol className="flex flex-col divide-y rounded-lg border">
                    {g.items.map((e, i) => {
                      const t = TYPE[e.type]
                      const at = parseUtc(e.at)
                      return (
                        <li key={i} className="flex items-start gap-3 p-3">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.className}`}>
                            <t.icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.action.charAt(0).toLowerCase() + e.action.slice(1)}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{at ? time.format(at) : ""}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {e.amount != null && <span className="font-nums text-sm font-medium">{formatRs(e.amount)}</span>}
                            {e.status && (
                              <Badge variant="outline" className={`text-[10px] capitalize ${statusClass(e.status)}`}>
                                {e.status}
                              </Badge>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
