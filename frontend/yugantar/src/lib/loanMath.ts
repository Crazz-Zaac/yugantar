/*
 * Loan repayment maths for the calculator.
 *
 * "simple" matches the backend calculator (POST /loans/calculator) exactly:
 *   monthly interest = amount × annual rate / 100 / 12   (on the full amount)
 *   total interest   = monthly interest × months
 *   instalment       = (amount + total interest) / months  (equal parts)
 *
 * "emi" is the standard reducing-balance EMI, offered only for policies that
 * allow EMI repayment. Rates are per year (% p.a.), as stored on the policy.
 */

export type RepaymentMethod = "simple" | "emi"

export interface ScheduleRow {
  month: number
  principal: number
  interest: number
  payment: number
  balance: number // principal still owed after this payment
}

export interface LoanQuote {
  method: RepaymentMethod
  amount: number
  annualRate: number
  months: number
  monthlyPayment: number
  monthlyInterest: number // first month's interest
  totalInterest: number
  totalRepayable: number
  schedule: ScheduleRow[]
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function quoteLoan(amount: number, annualRate: number, months: number, method: RepaymentMethod = "simple"): LoanQuote {
  const n = Math.max(1, Math.round(months))
  const P = Math.max(0, amount)
  const r = annualRate / 100 / 12
  const schedule: ScheduleRow[] = []

  if (method === "emi" && r > 0) {
    const payment = (P * r * (1 + r) ** n) / ((1 + r) ** n - 1)
    let balance = P
    for (let m = 1; m <= n; m++) {
      const interest = balance * r
      const principal = m === n ? balance : payment - interest
      balance = Math.max(0, balance - principal)
      schedule.push({ month: m, principal: round2(principal), interest: round2(interest), payment: round2(principal + interest), balance: round2(balance) })
    }
  } else {
    // Simple interest on the full amount, principal repaid in equal parts
    const interest = P * r
    const principal = P / n
    for (let m = 1; m <= n; m++) {
      schedule.push({ month: m, principal: round2(principal), interest: round2(interest), payment: round2(principal + interest), balance: round2(P - principal * m) })
    }
  }

  // Simple: same rounding as the backend (total computed once, then rounded)
  const totalInterest =
    method === "emi" && r > 0 ? round2(schedule.reduce((s, row) => s + row.interest, 0)) : round2(P * r * n)
  return {
    method: method === "emi" && r > 0 ? "emi" : "simple",
    amount: P,
    annualRate,
    months: n,
    monthlyPayment: schedule[0]?.payment ?? 0,
    monthlyInterest: schedule[0]?.interest ?? 0,
    totalInterest,
    totalRepayable: round2(P + totalInterest),
    schedule,
  }
}

/** The policy members should see first: the most recently effective one. */
export function latestPolicy<T extends { effective_from: string }>(policies: T[]): T | undefined {
  return [...policies].sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0]
}
