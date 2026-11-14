import { enumLabel, t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  Landmark,
  PhoneCall,
  PiggyBank,
  RefreshCw,
  Wallet,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/api/api"
import { UpcomingCard } from "@/components/tools/UpcomingCard"
import { formatDate, TIME_ZONE_LABEL } from "@/lib/datetime"
import { formatRs, formatRsCompact, monthLabel } from "@/lib/money"

// ─── API shape (GET /dashboard/me) ───────────────────────────────────────────

type Num = number | string

interface ActionItem {
  kind: "sign_policy" | "review_deposits" | "review_loans" | "review_payments" | "authorise_proxy" | "pending_deposit"
  title: string
  detail: string
  count: number
  link: string
  urgent: boolean
}

interface MemberDashboard {
  first_name: string
  savings_total: Num
  deposits_count: number
  pending_amount: Num
  pending_count: number
  fines_total: Num
  next_due: { due_date: string; amount: Num; policy_label: string; paid: boolean; days_left: number } | null
  loan: {
    status: string
    purpose: string | null
    principal: Num
    principal_paid: Num
    interest_paid: Num
    outstanding: Num
    progress_pct: number
    interest_rate: Num
    start_date: string
    maturity_date: string
    payments: number
  } | null
  loan_application_pending: boolean
  monthly: { month: string; deposited: Num; cumulative: Num; repaid: Num }[]
  actions: ActionItem[]
  recent: { date: string; kind: "deposit" | "loan_payment"; description: string; amount: Num; status: string }[]
}

const ACTION_ICON: Record<ActionItem["kind"], typeof FileSignature> = {
  sign_policy: FileSignature,
  review_deposits: Landmark,
  review_loans: CreditCard,
  review_payments: Wallet,
  authorise_proxy: PhoneCall,
  pending_deposit: Clock,
}

const todayLabel = () =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kathmandu" }).format(new Date())

// ─── Small building blocks ───────────────────────────────────────────────────

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  children,
}: {
  label: string
  value: string
  hint?: React.ReactNode
  icon: typeof Wallet
  tone?: "primary" | "warning" | "success" | "muted"
  children?: React.ReactNode
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/15 text-warning-foreground dark:text-warning",
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
  }[tone]
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="font-nums text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{value}</p>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        {children}
      </CardContent>
    </Card>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label ? monthLabel(label, true) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-nums font-medium">{formatRs(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}

// ─── Home ────────────────────────────────────────────────────────────────────

export function HomeTab() {
  const [, navigate] = useLocation()
  const [data, setData] = useState<MemberDashboard | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/dashboard/me")
      .then((res) => !cancelled && setData(res.data as MemberDashboard))
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
          <p className="text-sm">{t("Couldn't load your dashboard.")}</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("Try again")}</Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return <HomeSkeleton />

  const chart = data.monthly.map((m) => ({
    month: m.month,
    savings: Number(m.cumulative),
    deposited: Number(m.deposited),
    repaid: Number(m.repaid),
  }))
  const due = data.next_due
  const loan = data.loan

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("Namaste, {0}", data.first_name)}</h2>
        <p className="text-sm text-muted-foreground">
          {todayLabel()} · {TIME_ZONE_LABEL}
        </p>
      </div>

      {/* Action needed */}
      {data.actions.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              {t("Needs your attention")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {data.actions.map((a, i) => {
              const Icon = ACTION_ICON[a.kind]
              return (
                <button
                  key={`${a.kind}-${i}`}
                  type="button"
                  onClick={() => navigate(a.link)}
                  className="group flex items-center gap-3 py-3 text-left first:pt-1 last:pb-1"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.urgent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.detail}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Calendar: next events and meetings */}
      <UpcomingCard />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          label={t("My savings")}
          value={formatRs(data.savings_total)}
          icon={PiggyBank}
          hint={data.deposits_count === 1 ? t("{0} verified deposit", 1) : t("{0} verified deposits", data.deposits_count)}
        />
        <Kpi
          label={t("Next deposit")}
          value={due ? formatRs(due.amount) : "—"}
          icon={CalendarClock}
          tone={due && !due.paid && due.days_left <= 3 ? "warning" : due?.paid ? "success" : "primary"}
          hint={
            due ? (
              due.paid ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3 w-3" /> {t(" Paid for ")}{formatDate(due.due_date)}
                </span>
              ) : (
                <>{t("Due {0} · {1}", formatDate(due.due_date), due.days_left <= 0 ? t("today") : due.days_left === 1 ? t("{0} day left", 1) : t("{0} days left", due.days_left))}</>
              )
            ) : (
              t("No active deposit policy")
            )
          }
        />
        <Kpi
          label={t("Loan outstanding")}
          value={loan ? formatRs(loan.outstanding) : "—"}
          icon={CreditCard}
          tone={loan ? "primary" : "muted"}
          hint={loan ? t("of {0} · {1}% repaid", formatRs(loan.principal), loan.progress_pct) : data.loan_application_pending ? t("Application under review") : t("No active loan")}
        >
          {loan && <Progress value={loan.progress_pct} className="h-1.5" />}
        </Kpi>
        <Kpi
          label={t("Awaiting verification")}
          value={formatRs(data.pending_amount)}
          icon={Clock}
          tone={data.pending_count ? "warning" : "muted"}
          hint={
            data.pending_count
              ? data.pending_count === 1
                ? t("{0} deposit with the Treasurer", 1)
                : t("{0} deposits with the Treasurer", data.pending_count)
              : Number(data.fines_total) > 0
                ? t("Fines so far: {0}", formatRs(data.fines_total))
                : t("Nothing pending")
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("Savings growth")}</CardTitle>
            <CardDescription>{t("Your verified savings over the last 12 months")}</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pl-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                <YAxis tickFormatter={formatRsCompact} tickLine={false} axisLine={false} fontSize={11} width={64} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="savings" name="Savings" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#savingsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("Money in each month")}</CardTitle>
            <CardDescription>{t("Deposits and loan repayments")}</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pl-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.slice(-6)} margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={formatRsCompact} tickLine={false} axisLine={false} fontSize={11} width={64} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="deposited" name="Deposits" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="repaid" name="Loan repayments" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Loan + recent activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">{t("My loan")}</CardTitle>
              <CardDescription>{loan ? loan.purpose ?? t("Loan") : t("You don't have an active loan")}</CardDescription>
            </div>
            {loan && (
              <Badge variant="outline" className="border-success/30 bg-success/10 capitalize text-success">
                {enumLabel(loan.status)}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {loan ? (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">{t("Repaid")}</span>
                    <span className="font-nums font-medium">
                      {formatRs(loan.principal_paid)} <span className="text-muted-foreground">/ {formatRs(loan.principal)}</span>
                    </span>
                  </div>
                  <Progress value={loan.progress_pct} className="h-2" />
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                  {[
                    ["Outstanding", formatRs(loan.outstanding)],
                    ["Interest paid", formatRs(loan.interest_paid)],
                    ["Rate", t("{0}% p.a.", Number(loan.interest_rate))],
                    ["Matures", formatDate(loan.maturity_date)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                      <dd className="font-nums font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
                <p className="text-sm text-muted-foreground">
                  {data.loan_application_pending
                    ? t("Your loan application is being reviewed by the Treasurer and President.")
                    : t("Need funds? You can apply for a loan under the active loan policy.")}
                </p>
                <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/loans")}>
                  {data.loan_application_pending ? t("View application") : t("Apply for a loan")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t("Recent activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("No deposits or payments yet.")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {r.kind === "deposit" ? <Landmark className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.description}</span>
                      <span className="block text-xs text-muted-foreground">{formatDate(r.date)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-nums text-sm font-medium">{formatRs(r.amount)}</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] capitalize ${
                          r.status === "verified" ? "text-success" : r.status === "rejected" ? "text-destructive" : "text-warning-foreground dark:text-warning"
                        }`}
                      >
                        {r.status === "verified" && <BadgeCheck className="h-3 w-3" />}
                        {enumLabel(r.status)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
