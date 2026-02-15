import { Users, Landmark, CreditCard, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminKpis, memberGrowthChart, depositTrendsChart } from "@/lib/data"
// TODO: Replace mock data imports above with real API calls once backend endpoints are available:
// - GET /api/v1/admin/dashboard/kpis (adminKpis)
// - GET /api/v1/admin/dashboard/member-growth (memberGrowthChart)
// - GET /api/v1/admin/dashboard/deposit-trends (depositTrendsChart)
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function AdminKpiCard({
  title,
  value,
  change,
  icon: Icon,
  subtitle,
}: {
  title: string
  value: string
  change?: number
  icon: React.ElementType
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="font-nums text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1">
              {change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-success" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={`font-nums text-xs font-medium ${change >= 0 ? "text-success" : "text-destructive"}`}>
                {change >= 0 ? "+" : ""}{change}%
              </span>
            </div>
          )}
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-accent p-2.5">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      {/* Admin KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard
          title="Total Members"
          value={adminKpis.totalMembers.toString()}
          icon={Users}
          subtitle={`${adminKpis.activeMembers} active`}
        />
        <AdminKpiCard
          title="Total Deposits"
          value={formatCurrency(adminKpis.totalDeposits)}
          change={adminKpis.depositsGrowth}
          icon={Landmark}
        />
        <AdminKpiCard
          title="Loans Outstanding"
          value={formatCurrency(adminKpis.totalLoansOut)}
          icon={CreditCard}
          subtitle={`${adminKpis.loanDefault}% default rate`}
        />
        <AdminKpiCard
          title="Total Assets"
          value={formatCurrency(adminKpis.totalAssets)}
          change={adminKpis.assetsGrowth}
          icon={DollarSign}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Member Growth</CardTitle>
            <CardDescription>New members over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={memberGrowthChart}>
                  <defs>
                    <linearGradient id="memberGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number) => [value, "Members"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="members"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#memberGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Deposit & Withdrawal Trends</CardTitle>
            <CardDescription>Monthly cash flow for the last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depositTrendsChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number) =>
                      [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)]
                    }
                  />
                  <Legend />
                  <Bar dataKey="deposits" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Deposits" />
                  <Bar dataKey="withdrawals" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} name="Withdrawals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
