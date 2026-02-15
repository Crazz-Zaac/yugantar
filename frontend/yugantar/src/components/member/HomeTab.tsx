import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { kpiData, externalInvestments, activeLoan, savingsChartData, loanRepaymentChart } from "@/lib/data"
// TODO: Replace mock data imports above with real API calls once backend endpoints are available:
// - GET /api/v1/member/dashboard/kpis (kpiData)
// - GET /api/v1/member/investments (externalInvestments)
// - GET /api/v1/loans/active (activeLoan)
// - GET /api/v1/member/savings-chart (savingsChartData)
// - GET /api/v1/member/loan-repayment-chart (loanRepaymentChart)
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function KpiCard({
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

export function HomeTab() {
  const loanProgress = ((activeLoan.totalPaid / activeLoan.amount) * 100)

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Savings"
          value={formatCurrency(kpiData.totalSavings)}
          change={kpiData.savingsGrowth}
          icon={Wallet}
        />
        <KpiCard
          title="Active Loan"
          value={formatCurrency(kpiData.loanRemaining)}
          icon={CreditCard}
          subtitle={`${formatCurrency(kpiData.monthlyPayment)}/mo payment`}
        />
        <KpiCard
          title="Dividends Earned"
          value={formatCurrency(kpiData.dividendEarned)}
          change={kpiData.dividendRate}
          icon={PiggyBank}
        />
        <KpiCard
          title="Total Investments"
          value={formatCurrency(kpiData.totalInvestments)}
          change={kpiData.investmentReturn}
          icon={BarChart3}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Savings Growth Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Savings Growth</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={savingsChartData}>
                  <defs>
                    <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    formatter={(value: number) => [formatCurrency(value), "Savings"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#savingsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Loan Repayment Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Loan Repayment</CardTitle>
            <CardDescription>Monthly payments vs remaining balance</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loanRepaymentChart}>
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
                    formatter={(value: number) => [formatCurrency(value)]}
                  />
                  <Bar dataKey="paid" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Paid" />
                  <Bar dataKey="remaining" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Remaining" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Loan + Investments Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Active Loan Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Active Loan</CardTitle>
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                Current
              </Badge>
            </div>
            <CardDescription>{activeLoan.id} - {activeLoan.purpose}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Loan Amount</p>
                <p className="font-nums text-xl font-bold text-foreground">{formatCurrency(activeLoan.amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Interest Rate</p>
                <p className="font-nums text-lg font-semibold text-foreground">{activeLoan.interestRate}%</p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">Repayment Progress</span>
                <span className="font-nums font-medium text-foreground">{loanProgress.toFixed(0)}%</span>
              </div>
              <Progress value={loanProgress} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Total Paid</p>
                <p className="font-nums text-sm font-semibold text-foreground">{formatCurrency(activeLoan.totalPaid)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Remaining</p>
                <p className="font-nums text-sm font-semibold text-foreground">{formatCurrency(activeLoan.remaining)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Monthly Payment</p>
                <p className="font-nums text-sm font-semibold text-foreground">{formatCurrency(activeLoan.monthlyPayment)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Next Due</p>
                <p className="font-nums text-sm font-semibold text-foreground">{kpiData.nextPaymentDate}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* External Investments */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">External Investments</CardTitle>
            <CardDescription>Cooperative investment portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {externalInvestments.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">{inv.name}</p>
                    <p className="text-xs text-muted-foreground">{inv.type}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-nums text-sm font-semibold text-foreground">{formatCurrency(inv.amount)}</p>
                      <p className="text-xs text-muted-foreground">Invested</p>
                    </div>
                    <div className="text-right">
                      <p className="font-nums text-sm font-semibold text-success">+{inv.returnRate}%</p>
                      <p className="text-xs text-muted-foreground">Return</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
