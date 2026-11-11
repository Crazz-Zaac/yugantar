import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { AlertCircle, ArrowRight, CreditCard, FileSignature, Landmark, PiggyBank, RefreshCw, UserCheck, Users } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/api/api"
import { formatDate, formatDateTime } from "@/lib/datetime"
import { formatRs, formatRsCompact, monthLabel } from "@/lib/money"

// ─── API shape (GET /dashboard/admin) ────────────────────────────────────────

type Num = number | string
type MemberStatus = "active" | "pending_approval" | "unverified" | "disabled"

interface AdminDashboard {
  members_active: number
  members_pending_approval: number
  members_unverified: number
  members_disabled: number
  members_new_this_month: number
  savings_total: Num
  deposits_this_month: Num
  pending_deposits: number
  loans_outstanding: Num
  active_loans: number
  pending_loan_applications: number
  open_policies: { policy_type: string; policy_id: string; label: string; approved: number; required: number; rejected: number; deadline: string | null }[]
  monthly: { month: string; deposits: Num; loans_disbursed: Num; new_members: number; total_members: number }[]
  recent_members: { id: string; name: string; email: string; joined_at: string; status: MemberStatus }[]
}

const STATUS: Record<MemberStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "border-success/30 bg-success/10 text-success" },
  pending_approval: { label: "Awaiting approval", className: "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning" },
  unverified: { label: "Email unverified", className: "border-border bg-muted text-muted-foreground" },
  disabled: { label: "Suspended", className: "border-destructive/30 bg-destructive/10 text-destructive" },
}

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint: React.ReactNode; icon: typeof Users }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="font-nums text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  )
}

function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label ? monthLabel(label, true) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-nums font-medium">{money ? formatRs(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function OverviewTab() {
  const [, navigate] = useLocation()
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/dashboard/admin")
      .then((res) => !cancelled && setData(res.data as AdminDashboard))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const load = () => {
    setError(false)
    setReloadKey((k) => k + 1)
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">Couldn't load the overview.</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const chart = data.monthly.map((m) => ({
    month: m.month,
    deposits: Number(m.deposits),
    loans: Number(m.loans_disbursed),
    members: m.total_members,
  }))
  const attention = [
    data.members_pending_approval > 0 && {
      icon: UserCheck,
      title: `${data.members_pending_approval} registration${data.members_pending_approval === 1 ? "" : "s"} awaiting your approval`,
      detail: "New members can sign in only after you approve them.",
      link: "/admin/members",
    },
    ...data.open_policies.map((p) => ({
      icon: FileSignature,
      title: `${p.label}: ${p.approved}/${p.required} signed`,
      detail: `${p.rejected ? `${p.rejected} rejected · ` : ""}Signing closes ${formatDateTime(p.deadline)}`,
      link: "/admin/policies",
      progress: p.required ? (p.approved / p.required) * 100 : 0,
    })),
  ].filter(Boolean) as { icon: typeof Users; title: string; detail: string; link: string; progress?: number }[]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          label="Members"
          value={String(data.members_active)}
          icon={Users}
          hint={
            <>
              {data.members_new_this_month} new this month
              {data.members_pending_approval > 0 && <span className="text-warning-foreground dark:text-warning"> · {data.members_pending_approval} awaiting approval</span>}
            </>
          }
        />
        <Kpi label="Total savings" value={formatRs(data.savings_total)} icon={PiggyBank} hint={`${formatRs(data.deposits_this_month)} deposited this month`} />
        <Kpi label="Loans outstanding" value={formatRs(data.loans_outstanding)} icon={CreditCard} hint={`${data.active_loans} active loan${data.active_loans === 1 ? "" : "s"}`} />
        <Kpi
          label="With office bearers"
          value={String(data.pending_deposits + data.pending_loan_applications)}
          icon={Landmark}
          hint={`${data.pending_deposits} deposit${data.pending_deposits === 1 ? "" : "s"} · ${data.pending_loan_applications} loan application${data.pending_loan_applications === 1 ? "" : "s"}`}
        />
      </div>

      {attention.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {attention.map((a, i) => (
              <button key={i} type="button" onClick={() => navigate(a.link)} className="group flex items-center gap-3 py-3 text-left first:pt-1 last:pb-1">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.detail}</span>
                  {a.progress !== undefined && <Progress value={a.progress} className="mt-2 h-1.5 max-w-xs" />}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Deposits and loans</CardTitle>
            <CardDescription>Verified deposits and loans disbursed per month</CardDescription>
          </CardHeader>
          <CardContent className="h-72 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={formatRsCompact} tickLine={false} axisLine={false} fontSize={11} width={64} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="deposits" name="Deposits" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="loans" name="Loans disbursed" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Members</CardTitle>
            <CardDescription>Active members over the last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="h-72 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="membersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip content={<ChartTooltip money={false} />} />
                <Area type="stepAfter" dataKey="members" name="Members" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#membersFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Recent registrations</CardTitle>
            <CardDescription>Newest accounts first</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/members")}>
            All members <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {data.recent_members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                  {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(m.joined_at)}</span>
                <Badge variant="outline" className={`text-[11px] ${STATUS[m.status].className}`}>
                  {STATUS[m.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
