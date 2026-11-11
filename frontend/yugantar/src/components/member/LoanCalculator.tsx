import { useMemo, useState } from "react"
import { ArrowRight, CalendarCheck, Calculator, ChevronDown, Info, ShieldCheck, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatDate } from "@/lib/datetime"
import { formatRs } from "@/lib/money"
import { quoteLoan, type RepaymentMethod } from "@/lib/loanMath"

export interface CalculatorPolicy {
  policy_id: string
  min_loan_amount: number | string
  max_loan_amount: number | string
  interest_rate: number | string
  grace_period_days: number | null
  max_renewals: number | null
  requires_collateral: boolean
  emi_applicable: boolean
  effective_from: string
}

interface Props {
  /** The loan policy chosen for the application (shared with the form) */
  policy: CalculatorPolicy
  /** "Apply with these numbers": fill the application form */
  onApply: (policyId: string, amount: number, months: number) => void
}

const TERM_PRESETS = [6, 12, 24, 36]
const MAX_SLIDER_MONTHS = 60
const MAX_MONTHS = 120

function amountStep(min: number, max: number) {
  const span = max - min
  return span >= 500_000 ? 10_000 : span >= 50_000 ? 1_000 : 100
}

const addMonths = (months: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

export function LoanCalculator({ policy, onApply }: Props) {
  const min = Number(policy?.min_loan_amount ?? 0)
  const max = Number(policy?.max_loan_amount ?? 0)
  const rate = Number(policy?.interest_rate ?? 0)

  const [amount, setAmount] = useState(() => Math.round((min + max) / 2 / 1000) * 1000 || min)
  const [months, setMonths] = useState(12)
  const [amountText, setAmountText] = useState<string | null>(null) // while typing
  const [method, setMethod] = useState<RepaymentMethod>("simple")
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const clampedAmount = Math.min(max, Math.max(min, amount))
  const effectiveMethod: RepaymentMethod = policy?.emi_applicable ? method : "simple"
  const quote = useMemo(() => quoteLoan(clampedAmount, rate, months, effectiveMethod), [clampedAmount, rate, months, effectiveMethod])
  const interestShare = quote.totalRepayable ? (quote.totalInterest / quote.totalRepayable) * 100 : 0

  const commitAmountText = () => {
    if (amountText === null) return
    const n = Number(amountText.replace(/[^\d.]/g, ""))
    if (Number.isFinite(n) && n > 0) setAmount(Math.min(max, Math.max(min, Math.round(n))))
    setAmountText(null)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Calculator className="h-4 w-4" />
              </span>
              Loan calculator
            </CardTitle>
            <CardDescription className="mt-1">
              See what a loan costs before you apply. Figures update as you move the sliders.
            </CardDescription>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Based on the loan policy you chose above: {formatRs(min)} – {formatRs(max)} at {rate}% per year.
        </p>
      </CardHeader>

      <CardContent className="grid gap-0 p-0 lg:grid-cols-[1fr_1.1fr]">
        {/* ── Inputs ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-7 p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="calc-amount" className="text-sm font-medium">
                How much do you need?
              </Label>
              <div className="relative w-36">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                <Input
                  id="calc-amount"
                  inputMode="numeric"
                  className="h-9 pl-9 text-right font-nums font-semibold"
                  value={amountText ?? clampedAmount.toLocaleString("en-IN")}
                  onChange={(e) => setAmountText(e.target.value)}
                  onBlur={commitAmountText}
                  onKeyDown={(e) => e.key === "Enter" && commitAmountText()}
                />
              </div>
            </div>
            <Slider
              aria-label="Loan amount"
              min={min}
              max={max}
              step={amountStep(min, max)}
              value={[clampedAmount]}
              onValueChange={([v]) => {
                setAmountText(null)
                setAmount(v)
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatRs(min)}</span>
              <span>{formatRs(max)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="calc-months" className="text-sm font-medium">
                Repay over
              </Label>
              <div className="relative w-36">
                <Input
                  id="calc-months"
                  type="number"
                  min={1}
                  max={MAX_MONTHS}
                  className="h-9 pr-16 text-right font-nums font-semibold"
                  value={months}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value))
                    if (n >= 1) setMonths(Math.min(MAX_MONTHS, n))
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">months</span>
              </div>
            </div>
            <Slider
              aria-label="Loan term in months"
              min={1}
              max={MAX_SLIDER_MONTHS}
              step={1}
              value={[Math.min(months, MAX_SLIDER_MONTHS)]}
              onValueChange={([v]) => setMonths(v)}
            />
            <div className="flex flex-wrap gap-2">
              {TERM_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    months === m ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                  }`}
                >
                  {m < 12 ? `${m} months` : `${m / 12} year${m === 12 ? "" : "s"}`}
                </button>
              ))}
            </div>
          </div>

          {policy.emi_applicable && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Repayment method</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
                {(
                  [
                    ["simple", "Simple interest"],
                    ["emi", "EMI (reducing balance)"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={method === id}
                    onClick={() => setMethod(id)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      method === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {effectiveMethod === "simple"
                ? `${rate}% per year simple interest on the full amount, charged monthly.`
                : `${rate}% per year on the remaining balance; each instalment is the same.`}
            </li>
            {!!policy.grace_period_days && (
              <li className="flex gap-2">
                <CalendarCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {policy.grace_period_days} days' grace before late penalties apply.
              </li>
            )}
            {policy.requires_collateral && (
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This policy requires collateral.
              </li>
            )}
          </ul>
        </div>

        {/* ── Results ────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 border-t bg-muted/30 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly instalment</p>
            <p className="mt-1 font-nums text-3xl font-semibold tracking-tight sm:text-4xl" aria-live="polite">
              {formatRs(quote.monthlyPayment)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {effectiveMethod === "simple"
                ? `${formatRs(quote.schedule[0]?.principal ?? 0)} principal + ${formatRs(quote.monthlyInterest)} interest, for ${quote.months} months`
                : `for ${quote.months} months`}
            </p>
          </div>

          {/* Principal vs interest */}
          <div className="flex flex-col gap-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="bg-chart-1 transition-all" style={{ width: `${100 - interestShare}%` }} />
              <div className="bg-chart-3 transition-all" style={{ width: `${interestShare}%` }} />
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-chart-1" /> You borrow
                </dt>
                <dd className="font-nums font-medium">{formatRs(quote.amount)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-chart-3" /> Total interest
                </dt>
                <dd className="font-nums font-medium">{formatRs(quote.totalInterest)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total to repay</dt>
                <dd className="font-nums font-semibold">{formatRs(quote.totalRepayable)}</dd>
              </div>
            </dl>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span>
              If paid out today, the loan would be repaid by <span className="font-medium">{formatDate(addMonths(quote.months))}</span>.
            </span>
          </div>

          {/* Repayment schedule */}
          <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between text-sm font-medium">
                Repayment schedule
                <ChevronDown className={`h-4 w-4 transition-transform ${scheduleOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border bg-card">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Month</th>
                      <th className="px-3 py-2 text-right font-medium">Principal</th>
                      <th className="px-3 py-2 text-right font-medium">Interest</th>
                      <th className="px-3 py-2 text-right font-medium">Pay</th>
                      <th className="px-3 py-2 text-right font-medium">Owed after</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-nums">
                    {quote.schedule.map((row) => (
                      <tr key={row.month}>
                        <td className="px-3 py-1.5">{row.month}</td>
                        <td className="px-3 py-1.5 text-right">{formatRs(row.principal)}</td>
                        <td className="px-3 py-1.5 text-right">{formatRs(row.interest)}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatRs(row.payment)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{formatRs(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Badge variant="outline" className="w-fit text-[11px] font-normal text-muted-foreground">
              Estimate · final terms are set when the loan is approved
            </Badge>
            <Button onClick={() => onApply(policy.policy_id, quote.amount, quote.months)}>
              Apply with these numbers
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
