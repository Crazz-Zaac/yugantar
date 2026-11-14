import { getLang, n, neDigits, t } from "@/lib/i18n"
import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { apiClient } from "@/api/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { DateField } from "@/components/DateField"
import { useConfirm } from "@/components/confirm/confirmContext"
import { apiError } from "@/components/policies/signing"
import { addDays, dayKey, formatDate, keyParts, makeKey } from "@/lib/datetime"
import { formatRs } from "@/lib/money"
import { cn } from "@/lib/utils"

/*
 * Expenses: the Treasurer records what the cooperative paid (in a few
 * seconds: amount, category, date, what for); every member sees them. A
 * mistake is voided with a reason, never deleted. They count in the
 * Financial Reports (Retained Earnings, cash, Schedule D, Expenses part).
 */

type Category = "meeting" | "agm" | "gift" | "office" | "bank_charges" | "transport" | "other"

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "meeting", label: "Meeting" },
  { value: "agm", label: "AGM" },
  { value: "gift", label: "Gift / welfare" },
  { value: "office", label: "Office & stationery" },
  { value: "bank_charges", label: "Bank charges" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
]
const LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]))

interface Expense {
  id: string
  amount_rupees: string
  category: Category
  spent_on: string
  description: string | null
  recorded_by_name: string
  created_at: string
  status: "pending" | "approved" | "rejected"
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_note: string | null
  can_review: boolean // the viewer may approve / reject it now
  voided: boolean
  voided_by_name: string | null
  void_reason: string | null
}

interface ExpenseList {
  items: Expense[]
  total_rupees: string
  by_category: Record<string, string>
  pending_rupees: string
  can_record: boolean
  can_approve: boolean
}

const LAST_CATEGORY = "yugantar.lastExpenseCategory"
const AD_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const NE_AD_MONTHS = [
  "जनवरी",
  "फेब्रुअरी",
  "मार्च",
  "अप्रिल",
  "मे",
  "जुन",
  "जुलाई",
  "अगस्ट",
  "सेप्टेम्बर",
  "अक्टोबर",
  "नोभेम्बर",
  "डिसेम्बर",
]

const monthTitle = (key: string) => {
  const { year, month } = keyParts(key)
  return getLang() === "ne" ? `${NE_AD_MONTHS[month - 1]} ${neDigits(String(year))}` : `${AD_MONTHS[month - 1]} ${year}`
}
const dateText = (day: string) => formatDate(`${day}T00:00:00+05:45`)

export function ExpensesTab() {
  const confirm = useConfirm()
  const today = dayKey(new Date())
  const [month, setMonth] = useState(() => makeKey(keyParts(today).year, keyParts(today).month, 1))
  const [data, setData] = useState<ExpenseList | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // Approvers: everything awaiting approval, whatever the month
  const [awaiting, setAwaiting] = useState<Expense[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  // Form
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState<Category>(() => {
    try {
      return (localStorage.getItem(LAST_CATEGORY) as Category) || "meeting"
    } catch {
      return "meeting"
    }
  })
  const [spentOn, setSpentOn] = useState(today)
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  const monthEnd = addDays(makeKey(keyParts(month).year, keyParts(month).month + 1, 1), -1)
  const isCurrentMonth = month === makeKey(keyParts(today).year, keyParts(today).month, 1)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/expenses", { params: { date_from: month, date_to: monthEnd } })
      .then((r) => {
        if (cancelled) return
        setData(r.data)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [month, monthEnd, reloadKey])

  const canApprove = data?.can_approve ?? false
  useEffect(() => {
    if (!canApprove) return
    let cancelled = false
    apiClient
      .get("/expenses", { params: { status: "pending" } })
      .then((r) => !cancelled && setAwaiting((r.data as ExpenseList).items.filter((x) => x.can_review)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canApprove, reloadKey])

  const approve = async (x: Expense) => {
    setBusyId(x.id)
    try {
      await apiClient.post(`/expenses/${x.id}/approve`)
      toast.success(t("Approved {0} · {1}", formatRs(x.amount_rupees), t(LABEL[x.category] ?? x.category)))
      setReloadKey((k) => k + 1)
    } catch (err) {
      toast.error(apiError(err, t("Couldn't approve the expense.")))
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (x: Expense) => {
    const answer = await confirm({
      title: t("Reject this expense?"),
      description: t(
        "{0} on {1} won't count in the reports. The Treasurer sees your reason.",
        formatRs(x.amount_rupees),
        dateText(x.spent_on),
      ),
      confirmLabel: t("Reject"),
      destructive: true,
      note: { label: t("Reason"), placeholder: t("e.g. No receipt"), required: true },
    })
    if (!answer.confirmed) return
    setBusyId(x.id)
    try {
      await apiClient.post(`/expenses/${x.id}/reject`, { reason: answer.note })
      toast.success(t("Expense rejected"))
      setReloadKey((k) => k + 1)
    } catch (err) {
      toast.error(apiError(err, t("Couldn't reject the expense.")))
    } finally {
      setBusyId(null)
    }
  }

  const shiftMonth = (dir: number) => {
    const { year, month: m } = keyParts(month)
    setMonth(makeKey(year, m + dir, 1))
  }

  const valid = Number(amount) > 0 && !!spentOn && (category !== "other" || description.trim().length >= 3)

  const record = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    try {
      await apiClient.post("/expenses", {
        amount_rupees: Number(amount),
        category,
        spent_on: spentOn,
        description: description.trim() || null,
      })
      toast.success(t("Recorded {0} · {1}", formatRs(Number(amount)), t(LABEL[category])), {
        description: t("Sent to the President for approval."),
      })
      try {
        localStorage.setItem(LAST_CATEGORY, category)
      } catch {
        /* private mode */
      }
      setAmount("")
      setDescription("")
      // Show the month it was recorded in
      setMonth(makeKey(keyParts(spentOn).year, keyParts(spentOn).month, 1))
      setReloadKey((k) => k + 1)
      amountRef.current?.focus()
    } catch (err) {
      toast.error(apiError(err, t("Couldn't record the expense.")))
    } finally {
      setSaving(false)
    }
  }

  const voidExpense = async (x: Expense) => {
    const answer = await confirm({
      title: t("Void this expense?"),
      description: t(
        "{0} on {1} stays on the record, marked void, and no longer counts in the reports.",
        formatRs(x.amount_rupees),
        dateText(x.spent_on),
      ),
      confirmLabel: t("Void"),
      destructive: true,
      note: { label: t("Reason"), placeholder: t("e.g. Entered twice"), required: true },
    })
    if (!answer.confirmed) return
    try {
      await apiClient.post(`/expenses/${x.id}/void`, { reason: answer.note })
      toast.success(t("Expense voided"))
      setReloadKey((k) => k + 1)
    } catch (err) {
      toast.error(apiError(err, t("Couldn't void the expense.")))
    }
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{t("Couldn't load expenses.")}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("Try again")}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return <Skeleton className="h-64 w-full" />

  const live = data.items.filter((x) => !x.voided)

  const reviewButtons = (x: Expense) => (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" className="h-8" onClick={() => approve(x)} disabled={busyId === x.id}>
        {busyId === x.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 sm:mr-1" />}
        <span className="hidden sm:inline">{t("Approve")}</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-destructive hover:text-destructive"
        onClick={() => reject(x)}
        disabled={busyId === x.id}
        aria-label={t("Reject")}
      >
        <X className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">{t("Reject")}</span>
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {awaiting.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Hourglass className="h-4 w-4 text-amber-600" />
              {t("Awaiting your approval")}
              <Badge variant="secondary">{n(awaiting.length)}</Badge>
            </CardTitle>
            <CardDescription>
              {t("Expenses count in the Financial Reports only once you approve them.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {awaiting.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">{dateText(x.spent_on)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">
                        {t(LABEL[x.category] ?? x.category)}
                      </Badge>
                      <span className="truncate">{x.description || "–"}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("Recorded by {0}", x.recorded_by_name)}
                    </p>
                  </div>
                  <span className="font-nums shrink-0 text-sm font-semibold">{formatRs(x.amount_rupees)}</span>
                  {reviewButtons(x)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.can_record && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-primary" />
              {t("Record an expense")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={record} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="exp-amount">{t("Amount (Rs.)")}</Label>
                  <Input
                    id="exp-amount"
                    ref={amountRef}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-nums h-10 text-base"
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="exp-date">{t("Date paid")}</Label>
                  <DateField id="exp-date" value={spentOn} max={today} onChange={(v) => v && setSpentOn(v)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("Category")}</Label>
                <div role="radiogroup" className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={category === c.value}
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        category === c.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground",
                      )}
                    >
                      {t(c.label)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="exp-desc">
                    {t("What for")}{" "}
                    <span className="font-normal text-muted-foreground">
                      {category === "other" ? t("(required for Other)") : t("(optional)")}
                    </span>
                  </Label>
                  <Input
                    id="exp-desc"
                    maxLength={255}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("e.g. Tea and snacks for the monthly meeting")}
                  />
                </div>
                <Button type="submit" disabled={!valid || saving} className="sm:w-44">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ReceiptText className="mr-2 h-4 w-4" />
                  )}
                  {t("Record expense")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">{t("Expenses")}</CardTitle>
            <CardDescription>
              {data.can_record
                ? t("Everything recorded is visible to all members and counts in the Financial Reports.")
                : t("Expenses recorded by the Treasurer. They count in the Financial Reports.")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => shiftMonth(-1)}
              aria-label={t("Previous")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{monthTitle(month)}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => shiftMonth(1)}
              disabled={isCurrentMonth}
              aria-label={t("Next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Month totals */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3">
            <span className="mr-2 text-sm">
              {t("Approved")}: <span className="font-nums font-semibold">{formatRs(data.total_rupees)}</span>
            </span>
            {Number(data.pending_rupees) > 0 && (
              <span className="mr-2 text-sm text-amber-700 dark:text-amber-400">
                {t("Awaiting approval")}:{" "}
                <span className="font-nums font-semibold">{formatRs(data.pending_rupees)}</span>
              </span>
            )}
            {Object.entries(data.by_category).map(([cat, v]) => (
              <Badge key={cat} variant="secondary" className="font-normal">
                {t(LABEL[cat] ?? cat)} · <span className="font-nums ml-1">{formatRs(v)}</span>
              </Badge>
            ))}
          </div>

          {data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
              {t("No expenses recorded this month.")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.items.map((x) => (
                <li
                  key={x.id}
                  className={cn(
                    "flex items-center gap-3 py-2.5",
                    (x.voided || x.status === "rejected") && "opacity-60",
                  )}
                >
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">{dateText(x.spent_on)}</div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("flex flex-wrap items-center gap-2 text-sm", x.voided && "line-through")}>
                      <Badge variant="outline" className="text-[10px]">
                        {t(LABEL[x.category] ?? x.category)}
                      </Badge>
                      <span className="truncate">{x.description || "–"}</span>
                      {!x.voided && <StatusBadge status={x.status} />}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {x.voided
                        ? t("Voided by {0}: {1}", x.voided_by_name ?? "", x.void_reason ?? "")
                        : x.status === "approved"
                          ? t("Recorded by {0} · approved by {1}", x.recorded_by_name, x.reviewed_by_name ?? "")
                          : x.status === "rejected"
                            ? t("Rejected by {0}: {1}", x.reviewed_by_name ?? "", x.review_note ?? "")
                            : t("Recorded by {0}", x.recorded_by_name)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-nums shrink-0 text-sm font-medium",
                      (x.voided || x.status === "rejected") && "line-through",
                    )}
                  >
                    {formatRs(x.amount_rupees)}
                  </span>
                  {x.can_review && reviewButtons(x)}
                  {data.can_record && !x.voided && x.status !== "rejected" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => voidExpense(x)}
                      aria-label={t("Void")}
                      title={t("Void")}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {live.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{t("{0} expenses this month", n(live.length))}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: Expense["status"] }) {
  const style = {
    pending: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
    approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
    rejected: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200",
  }[status]
  const label = { pending: "Awaiting approval", approved: "Approved", rejected: "Rejected" }[status]
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", style)}>{t(label)}</span>
}
