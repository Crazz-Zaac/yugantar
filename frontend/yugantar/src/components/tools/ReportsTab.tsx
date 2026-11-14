import { getLang, n, neDigits, t } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Archive,
  Download,
  FileCheck2,
  FileText,
  Landmark,
  Loader2,
  Percent,
  RefreshCw,
  Scale,
  BookOpenText,
} from "lucide-react"
import { toast } from "sonner"
import { apiClient } from "@/api/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DateField } from "@/components/DateField"
import { useConfirm } from "@/components/confirm/confirmContext"
import { apiError } from "@/components/policies/signing"
import { adToBs, bsMonthLength, bsToAd, BS_MONTHS } from "@/lib/bs"
import { addDays, formatDate, formatDateTime, keyParts, makeKey } from "@/lib/datetime"
import { downloadFile } from "@/lib/download"
import { formatRs } from "@/lib/money"
import { cn } from "@/lib/utils"

/*
 * Financial Reports
 *   Monthly Financial Statement: contributions, loans issued, capital due / advance
 *   Monthly Accrual Report:      principal outstanding, interest, renewal / service charges, deposit fines
 *   Report Archive:              official PDFs generated so far (reference numbers)
 *
 * Both reports come from the same figures (GET /reports/preview) for a From
 * date - To date range; each is generated as its own official PDF.
 */

type Money = string // rupees, "1234.50"
type Kind = "complete_report" | "financial_statement" | "accrual_report" | "financial_position"
type MonthlyKind = "financial_statement" | "accrual_report"
type Tab = Kind | "archive"

interface SummaryRow {
  member_id: string
  member_name: string
  capital_month: Money
  capital_total: Money
  loans_issued: Money
  capital_due: Money
  capital_advance: Money
}

interface AccrualRow {
  member_id: string
  member_name: string
  principal_outstanding: Money
  durations: { month: number; term: number }[]
  interest_accrual: Money
  service_charge: Money
  deposit_fine: Money
}

/** Statement of Financial Position (rupees; null = not tracked yet) */
interface Position {
  as_at: string
  deposit_receivables: Money
  loans_outstanding: Money
  equity_investment: Money | null
  cash: Money
  total_assets: Money
  share_capital: Money
  capital_advance: Money
  retained_earnings: Money
  margin_loan: Money | null
  total_equity_liabilities: Money
  capital_received: Money
  loans_paid_out: Money
  principal_repaid: Money
  fines_received: Money
  interest_received: Money
  service_charges_received: Money
  equity_profit: Money | null
  income_received: Money
  expenses_paid: Money
}

interface ExpenseRow {
  expense_id: string
  spent_on: string
  category: string
  description: string | null
  amount: Money
  recorded_by_name: string
  approved_by_name?: string | null
}

const EXPENSE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  agm: "AGM",
  gift: "Gift / welfare",
  office: "Office & stationery",
  bank_charges: "Bank charges",
  transport: "Transport",
  other: "Other",
}

interface MonthOut {
  month: string
  start: string
  end: string
  partial: boolean
  to_date: boolean
  summary: SummaryRow[]
  summary_total: SummaryRow
  accruals: AccrualRow[]
  accrual_total: AccrualRow
  loans: LoanRow[]
}

/** One open loan in a month section (loan-level schedule) */
interface LoanRow {
  loan_id: string
  reference: string
  member_id: string
  member_name: string
  principal: Money
  principal_outstanding: Money
  interest_rate: string
  month: number
  term: number
  interest_accrual: Money
  service_charge: Money
}

interface Statement {
  period_from: string
  period_to: string
  months: MonthOut[]
  period_totals: Record<string, Money>
  position_start: Position
  position_end: Position
  expenses: ExpenseRow[]
  expenses_pending: ExpenseRow[]
  expenses_by_category: Record<string, Money>
}

interface GeneratedReport {
  id: string
  kind: Kind | "monthly_statement" // monthly_statement: earlier combined statement (A + B)
  reference: string
  period_from: string
  period_to: string
  generated_by_name: string
  generated_at: string
}

interface Options {
  first_date: string
  last_date: string
  max_days: number
}

const KIND_INFO: Record<Kind, { title: string; short: string; description: string; icon: typeof FileText }> = {
  complete_report: {
    title: "Complete Report",
    short: "Complete Financial Report",
    description:
      "Everything in one report: the Statement of Financial Position, the Monthly Financial Statement and the Monthly Accrual Report.",
    icon: BookOpenText,
  },
  financial_statement: {
    title: "Monthly Financial Statement",
    short: "Financial Statement",
    description: "Member contributions, loans issued, capital due and capital advance, month by month.",
    icon: Landmark,
  },
  accrual_report: {
    title: "Monthly Accrual Report",
    short: "Accrual Report",
    description: "Principal outstanding, loan duration, interest accrual, renewal / service charges and deposit fines.",
    icon: Percent,
  },
  financial_position: {
    title: "Statement of Financial Position",
    short: "Financial Position",
    description:
      "Assets (deposit receivables, loans to members, equity investment, cash / bank) and equity and liabilities (share capital, capital advance, retained earnings, margin loan) as at the To date.",
    icon: Scale,
  },
}

// Reports generated before the split into two reports (both parts, whole months)
const LEGACY_SHORT = "Statement of accounts (combined)"

const TAB_KEY = "yugantar.reportsTab"
const readTab = (): Tab => {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return v === "financial_statement" || v === "accrual_report" || v === "financial_position" || v === "archive"
      ? v
      : "complete_report"
  } catch {
    return "complete_report"
  }
}

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

/** "November 2026" / "नोभेम्बर २०२६" */
function monthName(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return getLang() === "ne" ? `${NE_AD_MONTHS[m - 1]} ${neDigits(String(y))}` : `${AD_MONTHS[m - 1]} ${y}`
}

/** A section's days in BS: "कार्तिक १६ – मंसिर १४, २०८३". */
function bsSpan(m: MonthOut): string {
  const a = keyParts(dayOf(m.start))
  const b = keyParts(addDays(dayOf(m.end), -1))
  const x = adToBs(a.year, a.month, a.day)
  const y = adToBs(b.year, b.month, b.day)
  if (!x || !y) return ""
  const d = (v: number) => neDigits(String(v))
  return x.year === y.year
    ? `${BS_MONTHS[x.month - 1]} ${d(x.day)} – ${BS_MONTHS[y.month - 1]} ${d(y.day)}, ${d(y.year)}`
    : `${BS_MONTHS[x.month - 1]} ${d(x.day)}, ${d(x.year)} – ${BS_MONTHS[y.month - 1]} ${d(y.day)}, ${d(y.year)}`
}

// NPT day of an API timestamp
const NPT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const dayOf = (iso: string) => NPT.format(new Date(iso))

const rangeText = (a: string, b: string) =>
  a === b
    ? formatDate(`${a}T00:00:00+05:45`)
    : `${formatDate(`${a}T00:00:00+05:45`)} – ${formatDate(`${b}T00:00:00+05:45`)}`

const money = (v: Money, blankZero = true) => (Number(v) === 0 && blankZero ? "–" : formatRs(v))

/** Quick ranges, ending no later than `today`. */
interface Range {
  label: string
  from: string
  to: string
}

/** Nepal fiscal year quarters (Shrawan-Asar), oldest first, up to today. */
function fiscalQuarters(first: string, today: string): { year: string; quarters: Range[]; whole: Range }[] {
  const toKey = (y: number, m: number, d: number) => {
    const ad = bsToAd(y, m, d)
    return makeKey(ad.year, ad.month, ad.day)
  }
  const endOf = (y: number, m: number) => toKey(y, m, bsMonthLength(y, m))
  const fyOf = (key: string) => {
    const { year, month, day } = keyParts(key)
    const bs = adToBs(year, month, day)
    return bs ? (bs.month >= 4 ? bs.year : bs.year - 1) : null
  }
  const a = fyOf(first)
  const b = fyOf(today)
  if (a === null || b === null) return []
  const out = []
  for (let y = a; y <= b; y++) {
    const label = `${y}/${String(y + 1).slice(2)}`
    const spans: [string, number, number, number, number][] = [
      ["Q1 (Shrawan–Ashwin)", y, 4, y, 6],
      ["Q2 (Kartik–Poush)", y, 7, y, 9],
      ["Q3 (Magh–Chaitra)", y, 10, y, 12],
      ["Q4 (Baisakh–Asar)", y + 1, 1, y + 1, 3],
    ]
    const quarters = spans
      .map(([name, y1, m1, y2, m2]) => ({ label: name, from: toKey(y1, m1, 1), to: endOf(y2, m2) }))
      .filter((q) => q.from <= today)
      .map((q) => ({ ...q, to: q.to > today ? today : q.to }))
    const whole = { label: "Whole year", from: toKey(y, 4, 1), to: endOf(y + 1, 3) > today ? today : endOf(y + 1, 3) }
    out.push({ year: label, quarters, whole })
  }
  return out
}

function presets(today: string): { label: string; from: string; to: string }[] {
  const { year, month } = keyParts(today)
  const monthStart = makeKey(year, month, 1)
  const lastMonthStart = makeKey(year, month - 1, 1)
  const lastMonthEnd = addDays(monthStart, -1)
  return [
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { label: "Last 3 months", from: makeKey(year, month - 2, 1), to: today },
    { label: "This year", from: makeKey(year, 1, 1), to: today },
  ]
}

export function ReportsTab() {
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>(readTab)
  const [options, setOptions] = useState<Options | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [statement, setStatement] = useState<Statement | null>(null)
  const [loadedFor, setLoadedFor] = useState("")
  const [generating, setGenerating] = useState(false)
  const [reports, setReports] = useState<GeneratedReport[] | null>(null)
  const [archiveKind, setArchiveKind] = useState<"all" | Kind>("all")
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([apiClient.get("/reports/options"), apiClient.get("/reports")])
      .then(([o, r]) => {
        if (cancelled) return
        const opts = o.data as Options
        setOptions(opts)
        const { year, month } = keyParts(opts.last_date)
        setFrom((f) => f || makeKey(year, month, 1))
        setTo((v) => v || opts.last_date)
        setReports(r.data)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const rangeError = useMemo(() => {
    if (!from || !to || !options) return null
    if (to < from) return t("The To date must not be before the From date.")
    if (to > options.last_date) return t("The report can't include future dates.")
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
    if (days > options.max_days) return t("A report can cover at most 24 months.")
    return null
  }, [from, to, options])

  const quarters = useMemo(() => (options ? fiscalQuarters(options.first_date, options.last_date) : []), [options])
  // The select shows a quarter only when the dates are exactly that quarter
  const quarterValue = quarters.flatMap((fy) => [...fy.quarters, fy.whole]).some((q) => q.from === from && q.to === to)
    ? `${from}|${to}`
    : ""

  // The figures follow the chosen dates
  const rangeKey = `${from}|${to}`
  const loading = !rangeError && !!from && !!to && loadedFor !== rangeKey
  useEffect(() => {
    if (!from || !to || rangeError) return
    let cancelled = false
    const timer = setTimeout(() => {
      apiClient
        .get("/reports/preview", { params: { date_from: from, date_to: to } })
        .then((res) => {
          if (cancelled) return
          setStatement(res.data)
          setLoadedFor(`${from}|${to}`)
        })
        .catch((err) => {
          if (cancelled) return
          setLoadedFor(`${from}|${to}`)
          setStatement(null)
          toast.error(apiError(err, t("Couldn't prepare the report.")))
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [from, to, rangeError])

  const changeTab = (v: string) => {
    setTab(v as Tab)
    try {
      sessionStorage.setItem(TAB_KEY, v)
    } catch {
      /* private mode */
    }
  }

  const download = async (r: GeneratedReport) => {
    setDownloading(r.id)
    try {
      await downloadFile(`/reports/${r.id}/pdf`, `${r.reference.replaceAll("/", "-")}.pdf`)
    } catch {
      toast.error(t("Download failed."))
    } finally {
      setDownloading(null)
    }
  }

  const generate = async (kind: Kind) => {
    const answer = await confirm({
      title: t("Generate the official {0}?", t(KIND_INFO[kind].short)),
      description: t(
        "{0}. It gets the next reference number, is kept in the Report Archive and every member can download it. The figures are as they stand now.",
        rangeText(from, to),
      ),
      confirmLabel: t("Generate PDF"),
    })
    if (!answer.confirmed) return
    setGenerating(true)
    try {
      const res = await apiClient.post(`/reports/${kind}`, { date_from: from, date_to: to })
      const report = res.data as GeneratedReport
      setReports((list) => [report, ...(list ?? [])])
      toast.success(t("Report {0} generated", report.reference))
      await download(report)
    } catch (err) {
      toast.error(apiError(err, t("Couldn't generate the report.")))
    } finally {
      setGenerating(false)
    }
  }

  if (error && !options) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{t("Couldn't load reports.")}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("Try again")}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!options) return <Skeleton className="h-48 w-full" />

  const filters = (kind: Kind) => (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-from`}>{t("From date")}</Label>
            <DateField
              id={`${kind}-from`}
              value={from}
              min={options.first_date}
              max={options.last_date}
              onChange={(v) => {
                if (!v) return
                setFrom(v)
                if (to && to < v) setTo(v)
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-to`}>{t("To date")}</Label>
            <DateField
              id={`${kind}-to`}
              value={to}
              min={from || options.first_date}
              max={options.last_date}
              onChange={(v) => v && setTo(v)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={quarterValue}
            onValueChange={(v) => {
              const [a, b] = v.split("|")
              setFrom(a < options.first_date ? options.first_date : a)
              setTo(b)
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs sm:w-64" aria-label={t("Quarter")}>
              <SelectValue placeholder={t("Choose a quarter (fiscal year)")} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {quarters
                .slice()
                .reverse()
                .map((fy) => (
                  <SelectGroup key={fy.year}>
                    <SelectLabel className="text-xs">{t("Fiscal year {0}", n(fy.year))}</SelectLabel>
                    {fy.quarters
                      .slice()
                      .reverse()
                      .map((q) => (
                        <SelectItem key={q.label} value={`${q.from}|${q.to}`} className="text-xs">
                          {t(q.label)} · {n(fy.year)}
                        </SelectItem>
                      ))}
                    <SelectItem value={`${fy.whole.from}|${fy.whole.to}`} className="text-xs">
                      {t("Whole year")} · {n(fy.year)}
                    </SelectItem>
                  </SelectGroup>
                ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5">
            {presets(options.last_date).map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={from === p.from && to === p.to ? "secondary" : "ghost"}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => {
                  setFrom(p.from < options.first_date ? options.first_date : p.from)
                  setTo(p.to)
                }}
              >
                {t(p.label)}
              </Button>
            ))}
          </div>
        </div>
        {rangeError && <p className="text-xs text-destructive">{rangeError}</p>}
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("Preparing figures…")}
              </span>
            ) : (
              t("Only verified deposits and payments count. Times in NPT.")
            )}
          </p>
          <Button onClick={() => generate(kind)} disabled={!!rangeError || generating || !from || !to}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
            {t("Generate official PDF")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const shown = !loading && statement && statement.period_from === from && statement.period_to === to ? statement : null

  return (
    <Tabs value={tab} onValueChange={changeTab} className="flex flex-col gap-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
        {(Object.keys(KIND_INFO) as Kind[]).map((k) => {
          const Icon = KIND_INFO[k].icon
          return (
            <TabsTrigger key={k} value={k} className="gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {t(KIND_INFO[k].title)}
            </TabsTrigger>
          )
        })}
        <TabsTrigger value="archive" className="gap-1.5">
          <Archive className="h-3.5 w-3.5" />
          {t("Report Archive")}
          {reports && reports.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {n(reports.length)}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {(Object.keys(KIND_INFO) as Kind[]).map((kind) => (
        <TabsContent key={kind} value={kind} className="mt-0 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t(KIND_INFO[kind].description)}</p>
          {filters(kind)}
          {shown ? (
            kind === "complete_report" ? (
              <>
                <PartHeading n={1} title="Statement of Financial Position" />
                <PositionStatement end={shown.position_end} start={shown.position_start} totals={shown.period_totals} />
                <PartHeading n={2} title="Monthly Financial Statement" />
                <MonthlyParts kind="financial_statement" statement={shown} range={rangeText(from, to)} />
                <PartHeading n={3} title="Monthly Accrual Report" />
                <MonthlyParts kind="accrual_report" statement={shown} range={rangeText(from, to)} />
                <PartHeading n={4} title="Expenses" />
                <ExpensesCard statement={shown} range={rangeText(from, to)} />
              </>
            ) : kind === "financial_position" ? (
              <>
                <PositionStatement end={shown.position_end} start={shown.position_start} totals={shown.period_totals} />
                <ExpensesCard statement={shown} range={rangeText(from, to)} />
              </>
            ) : (
              <MonthlyParts kind={kind} statement={shown} range={rangeText(from, to)} />
            )
          ) : (
            loading && <Skeleton className="h-56 w-full" />
          )}
        </TabsContent>
      ))}

      <TabsContent value="archive" className="mt-0 flex flex-col gap-4">
        <Card>
          <CardHeader className="flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold">{t("Report Archive")}</CardTitle>
              <CardDescription>
                {t(
                  "Official copies with reference numbers, kept for the record. Signed copies are approved by the Treasurer and the President on paper.",
                )}
              </CardDescription>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={archiveKind}
              onValueChange={(v) => v && setArchiveKind(v as "all" | Kind)}
              className="shrink-0"
            >
              <ToggleGroupItem value="all" className="px-3 text-xs">
                {t("All")}
              </ToggleGroupItem>
              <ToggleGroupItem value="financial_statement" className="px-3 text-xs">
                {t("Financial Statement")}
              </ToggleGroupItem>
              <ToggleGroupItem value="complete_report" className="px-3 text-xs">
                {t("Complete")}
              </ToggleGroupItem>
              <ToggleGroupItem value="financial_position" className="px-3 text-xs">
                {t("Financial Position")}
              </ToggleGroupItem>
              <ToggleGroupItem value="accrual_report" className="px-3 text-xs">
                {t("Accrual Report")}
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            <ArchiveList
              reports={(reports ?? []).filter((r) => archiveKind === "all" || r.kind === archiveKind)}
              downloading={downloading}
              onDownload={download}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function ArchiveList({
  reports,
  downloading,
  onDownload,
}: {
  reports: GeneratedReport[]
  downloading: string | null
  onDownload: (r: GeneratedReport) => void
}) {
  if (reports.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
        {t("No reports generated yet.")}
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y">
      {reports.map((r) => {
        const info = r.kind === "monthly_statement" ? null : KIND_INFO[r.kind]
        const Icon = info?.icon ?? FileText
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
                <span className="font-nums">{r.reference}</span>
                <span className="text-xs font-normal text-muted-foreground">{t(info?.short ?? LEGACY_SHORT)}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {rangeText(r.period_from, r.period_to)} · {r.generated_by_name} · {formatDateTime(r.generated_at)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDownload(r)}
              disabled={downloading === r.id}
              aria-label={t("Download {0}", r.reference)}
            >
              {downloading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">{t("PDF")}</span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Report tables ──────────────────────────────────────────────────────────

const th =
  "whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
const td = "font-nums whitespace-nowrap px-3 py-2 text-right"

/** The section's dates: "1 Sep 2026 – 30 Sep 2026" and "30 Sep 2026". */
function sectionDates(m: MonthOut): { span: string; last: string } {
  const first = dayOf(m.start)
  const last = addDays(dayOf(m.end), -1)
  return { span: rangeText(first, last), last: rangeText(last, last) }
}

/** Under a table: whether amounts are activity during the period, cumulative, or a balance as at a date. */
function BasisNote({ parts }: { parts: [string, string][] }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 px-4 text-[11px] text-muted-foreground sm:px-0">
      {parts.map(([basis, what]) => (
        <span key={basis}>
          <span className="font-semibold text-foreground/80">{basis}:</span> {what}
        </span>
      ))}
    </p>
  )
}

function SectionCard({ m, children }: { m: MonthOut; children: React.ReactNode }) {
  const first = dayOf(m.start)
  const last = addDays(dayOf(m.end), -1)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
          {monthName(m.month)}
          {m.partial && <span className="text-xs font-normal text-muted-foreground">{rangeText(first, last)}</span>}
          {m.to_date && (
            <Badge variant="outline" className="text-[10px]">
              {t("to date")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">{bsSpan(m)}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">{children}</div>
      </CardContent>
    </Card>
  )
}

function SummarySection({ m }: { m: MonthOut }) {
  return (
    <SectionCard m={m}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={cn(th, "text-left")}>{t("Member")}</th>
            <th className={th}>{t("Capital deposited during period")}</th>
            <th className={th}>{t("Cumulative capital deposited")}</th>
            <th className={th}>{t("Cumulative loans issued")}</th>
            <th className={th}>{t("Outstanding capital contribution")}</th>
            <th className={th}>{t("Capital paid in advance")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {m.summary.map((r) => (
            <tr key={r.member_id}>
              <td className="px-3 py-2 font-medium">{r.member_name}</td>
              <td className={td}>{money(r.capital_month)}</td>
              <td className={td}>{money(r.capital_total, false)}</td>
              <td className={td}>{money(r.loans_issued)}</td>
              <td className={cn(td, Number(r.capital_due) > 0 && "text-destructive")}>{money(r.capital_due)}</td>
              <td className={cn(td, Number(r.capital_advance) > 0 && "text-emerald-600 dark:text-emerald-400")}>
                {money(r.capital_advance)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 bg-muted/40 font-semibold">
          <tr>
            <td className="px-3 py-2">{t("Total")}</td>
            <td className={td}>{money(m.summary_total.capital_month, false)}</td>
            <td className={td}>{money(m.summary_total.capital_total, false)}</td>
            <td className={td}>{money(m.summary_total.loans_issued, false)}</td>
            <td className={td}>{money(m.summary_total.capital_due, false)}</td>
            <td className={td}>{money(m.summary_total.capital_advance, false)}</td>
          </tr>
        </tfoot>
      </table>
      <BasisNote
        parts={[
          [t("During the period ({0})", sectionDates(m).span), t("capital deposited")],
          [t("Cumulative to {0}", sectionDates(m).last), t("capital deposited, loans issued")],
          [t("As at {0}", sectionDates(m).last), t("outstanding capital contribution, capital paid in advance")],
        ]}
      />
    </SectionCard>
  )
}

function AccrualSection({ m }: { m: MonthOut }) {
  const loansOf = (memberId: string) => m.loans.filter((l) => l.member_id === memberId).length
  return (
    <SectionCard m={m}>
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={cn(th, "text-left")}>{t("Member")}</th>
            <th className={cn(th, "text-center")}>{t("Loans")}</th>
            <th className={th}>{t("Principal outstanding")}</th>
            <th className={th}>{t("Interest accrual (earned)")}</th>
            <th className={th}>{t("Loan renewal / service charge")}</th>
            <th className={th}>{t("Fine in deposit")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {m.accruals.map((r) => (
            <tr key={r.member_id}>
              <td className="px-3 py-2 font-medium">{r.member_name}</td>
              <td className={cn(td, "text-center")}>{loansOf(r.member_id) ? n(loansOf(r.member_id)) : "–"}</td>
              <td className={td}>{money(r.principal_outstanding)}</td>
              <td className={td}>{money(r.interest_accrual)}</td>
              <td className={td}>{money(r.service_charge)}</td>
              <td className={td}>{money(r.deposit_fine)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 bg-muted/40 font-semibold">
          <tr>
            <td className="px-3 py-2">{t("Total")}</td>
            <td className={cn(td, "text-center")}>{m.loans.length ? n(m.loans.length) : "–"}</td>
            <td className={td}>{money(m.accrual_total.principal_outstanding, false)}</td>
            <td className={td}>{money(m.accrual_total.interest_accrual, false)}</td>
            <td className={td}>{money(m.accrual_total.service_charge, false)}</td>
            <td className={td}>{money(m.accrual_total.deposit_fine, false)}</td>
          </tr>
        </tfoot>
      </table>
      <BasisNote
        parts={[
          [t("As at {0}", sectionDates(m).last), t("loans, principal outstanding")],
          [
            t("During the period ({0})", sectionDates(m).span),
            t("interest accrual (earned, not necessarily received), renewal / service charge, fine in deposit"),
          ],
        ]}
      />

      {m.loans.length > 0 && (
        <>
          <p className="mb-2 mt-5 px-4 text-xs font-semibold text-foreground sm:px-0">{t("Loan schedule")}</p>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className={cn(th, "text-left")}>{t("Loan ref.")}</th>
                <th className={cn(th, "text-left")}>{t("Member")}</th>
                <th className={th}>{t("Principal")}</th>
                <th className={th}>{t("Outstanding")}</th>
                <th className={th}>{t("Rate p.a.")}</th>
                <th className={cn(th, "text-center")}>{t("Month of term")}</th>
                <th className={th}>{t("Interest accrual (earned)")}</th>
                <th className={th}>{t("Service charge")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {m.loans.map((l) => (
                <tr key={l.loan_id}>
                  <td className="font-nums px-3 py-2 text-xs">{l.reference}</td>
                  <td className="px-3 py-2">{l.member_name}</td>
                  <td className={td}>{money(l.principal, false)}</td>
                  <td className={td}>{money(l.principal_outstanding, false)}</td>
                  <td className={td}>{n(Number(l.interest_rate))}%</td>
                  <td className={cn(td, "text-center", l.month > l.term && "font-semibold text-destructive")}>
                    {t("{0} of {1}", l.month, l.term)}
                    {l.month > l.term && " *"}
                  </td>
                  <td className={td}>{money(l.interest_accrual)}</td>
                  <td className={td}>{money(l.service_charge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <BasisNote
            parts={[
              [t("Principal"), t("amount originally lent")],
              [t("As at {0}", sectionDates(m).last), t("outstanding, month of term")],
              [t("During the period ({0})", sectionDates(m).span), t("interest accrual, service charge")],
            ]}
          />
          {m.loans.some((l) => l.month > l.term) && (
            <p className="mt-2 px-4 text-[11px] text-destructive sm:px-0">{t("* past its maturity date")}</p>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── Statement of Financial Position ────────────────────────────────────────

/** "1,000.00", "(1,000.00)" when negative, "–" when not tracked */
const stmt = (v: Money | null) => {
  if (v === null || v === undefined) return "–"
  const x = Number(v)
  return x < 0 ? `(${formatRs(-x)})` : formatRs(x)
}

const dayBefore = (iso: string) => formatDate(new Date(new Date(iso).getTime() - 1000).toISOString())

function ExpensesCard({ statement, range }: { statement: Statement; range: string }) {
  const total = statement.expenses.reduce((a, e) => a + Number(e.amount), 0)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("Expenses")}</CardTitle>
        <CardDescription className="text-xs">
          {t("Expenses recorded by the Treasurer and approved by the President, paid during {0}.", range)}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {statement.expenses.length === 0 ? (
          <p className="px-4 text-xs text-muted-foreground sm:px-0">{t("No expenses recorded in this period.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className={cn(th, "text-left")}>{t("Date")}</th>
                  <th className={cn(th, "text-left")}>{t("Category")}</th>
                  <th className={cn(th, "text-left")}>{t("Description")}</th>
                  <th className={cn(th, "text-left")}>{t("Approved by")}</th>
                  <th className={th}>{t("Amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statement.expenses.map((e) => (
                  <tr key={e.expense_id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{rangeText(e.spent_on, e.spent_on)}</td>
                    <td className="px-3 py-2">{t(EXPENSE_LABEL[e.category] ?? e.category)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.description || "–"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.approved_by_name || "–"}</td>
                    <td className={td}>{formatRs(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-muted/40 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={4}>
                    {t("Total")}
                    <span className="ml-3 font-normal text-muted-foreground">
                      {Object.entries(statement.expenses_by_category)
                        .map(([k, v]) => `${t(EXPENSE_LABEL[k] ?? k)} ${formatRs(v)}`)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className={td}>{formatRs(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <BasisNote
          parts={[
            [
              t("During the period ({0})", range),
              t("each approved expense on the day it was paid; voided and rejected entries excluded"),
            ],
          ]}
        />
        {statement.expenses_pending.length > 0 && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 sm:mx-0 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              {t("Awaiting the President's approval (not counted in this report)")}
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {statement.expenses_pending.map((e) => (
                <li key={e.expense_id} className="flex justify-between gap-3">
                  <span>
                    {rangeText(e.spent_on, e.spent_on)} · {t(EXPENSE_LABEL[e.category] ?? e.category)}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  <span className="font-nums shrink-0">{formatRs(e.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PositionRow({
  label,
  k,
  total,
  indent,
  end,
  start,
}: {
  label: string
  k: keyof Position
  total?: boolean
  indent?: boolean
  end: Position
  start: Position
}) {
  return (
    <tr className={cn(total && "border-t-2 bg-muted/40 font-semibold")}>
      <td className={cn("px-3 py-2", indent && "pl-6")}>{t(label)}</td>
      <td className={td}>{stmt(end[k] as Money | null)}</td>
      <td className={cn(td, "text-muted-foreground")}>{stmt(start[k] as Money | null)}</td>
    </tr>
  )
}

function PositionHead({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={3} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-primary">
        {t(label)}
      </td>
    </tr>
  )
}

function PositionStatement({ end, start, totals }: { end: Position; start: Position; totals: Record<string, Money> }) {
  const accrued = Number(totals.interest_accrual)
  const received = Number(end.interest_received) - Number(start.interest_received)
  const cur = dayBefore(end.as_at)
  const prev = dayBefore(start.as_at)
  const balanced = end.total_assets === end.total_equity_liabilities
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {t("Statement of Financial Position")}
            <Badge variant={balanced ? "secondary" : "destructive"} className="text-[10px]">
              {balanced ? t("Balanced") : t("Not balanced")}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">{t("As at {0}", cur)}</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className={cn(th, "text-left")}>{t("Particulars")}</th>
                  <th className={th}>{t("As at {0}", cur)}</th>
                  <th className={th}>{t("As at {0}", prev)}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <PositionHead label="Assets" />
                <PositionRow
                  label="Deposit (Share Capital) receivables"
                  k="deposit_receivables"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow
                  label="Investment (Loan to Members)"
                  k="loans_outstanding"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow label="Investment in Equity Market" k="equity_investment" indent end={end} start={start} />
                <PositionRow label="Cash / Bank balance" k="cash" indent end={end} start={start} />
                <PositionRow label="Total assets" k="total_assets" total end={end} start={start} />
                <PositionHead label="Equity and liabilities" />
                <PositionRow label="Share Capital" k="share_capital" indent end={end} start={start} />
                <PositionRow label="Capital Advance" k="capital_advance" indent end={end} start={start} />
                <PositionRow
                  label="Retained Earnings (income received less expenses)"
                  k="retained_earnings"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow label="Margin Loan" k="margin_loan" indent end={end} start={start} />
                <PositionRow
                  label="Total equity and liabilities"
                  k="total_equity_liabilities"
                  total
                  end={end}
                  start={start}
                />
              </tbody>
            </table>
          </div>
          <BasisNote
            parts={[
              [
                t("As at {0} and {1}", cur, prev),
                t("every line is a closing balance on that date, not activity during the period"),
              ],
            ]}
          />
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("Schedules")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y">
                <PositionHead label="Retained earnings (income received less expenses)" />
                <PositionRow
                  label="Late deposit fines and loan penalties"
                  k="fines_received"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow label="Loan interest" k="interest_received" indent end={end} start={start} />
                <PositionRow
                  label="Loan renewal / service charges"
                  k="service_charges_received"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow
                  label="Profit from Investment in Equity Market"
                  k="equity_profit"
                  indent
                  end={end}
                  start={start}
                />
                <PositionRow label="Income received" k="income_received" indent end={end} start={start} />
                <PositionRow label="Less: expenses paid" k="expenses_paid" indent end={end} start={start} />
                <PositionRow label="Retained Earnings" k="retained_earnings" total end={end} start={start} />
                <PositionHead label="Investment (Loan to Members)" />
                <PositionRow label="Loans paid out" k="loans_paid_out" indent end={end} start={start} />
                <PositionRow label="Principal repaid" k="principal_repaid" indent end={end} start={start} />
                <PositionHead label="Cash / Bank balance" />
                <PositionRow
                  label="Capital received from members"
                  k="capital_received"
                  indent
                  end={end}
                  start={start}
                />
              </tbody>
            </table>
          </div>
          <BasisNote
            parts={[
              [t("Cumulative to each date"), t("income received, loans paid out, principal repaid, capital received")],
            ]}
          />
          <p className="mt-3 px-4 text-[11px] text-muted-foreground sm:px-0">
            {t(
              "Cash / Bank balance = capital received + income received − principal outstanding. It's worked out from the recorded transactions (no opening balance or bank statement yet). Income counts when received. Amounts in brackets are negative.",
            )}
          </p>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("Interest: earned vs received")}</CardTitle>
          <CardDescription className="text-xs">
            {t(
              "Retained Earnings count only income actually received. Interest accrued is earned on the loans whether or not it has been paid, so it is not income in this statement.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 sm:grid-cols-3">
            {(
              [
                [t("Interest accrued (earned) during the period"), accrued],
                [t("Interest received during the period"), received],
                [t("Earned less received (not in Retained Earnings)"), accrued - received],
              ] as [string, number][]
            ).map(([label, v], i) => (
              <div
                key={label}
                className={cn("flex flex-col gap-1 border-b py-2 sm:border-b-0", i === 2 && "font-semibold")}
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-nums text-sm">{stmt(String(v))}</dd>
              </div>
            ))}
          </dl>
          <BasisNote
            parts={[
              [
                t("During the period ({0})", rangeText(dayOf(start.as_at), addDays(dayOf(end.as_at), -1))),
                t("all three figures"),
              ],
            ]}
          />
        </CardContent>
      </Card>
    </>
  )
}

function PartHeading({ n: part, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n(part)}
      </span>
      <h3 className="text-base font-semibold text-foreground">{t(title)}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function MonthlyParts({ kind, statement, range }: { kind: MonthlyKind; statement: Statement; range: string }) {
  return (
    <>
      {statement.months.map((m) =>
        kind === "financial_statement" ? (
          <SummarySection key={m.month} m={m} />
        ) : (
          <AccrualSection key={m.month} m={m} />
        ),
      )}
      <PeriodTotals
        kind={kind}
        totals={statement.period_totals}
        range={range}
        endDay={sectionDates(statement.months[statement.months.length - 1]).last}
      />
    </>
  )
}

type Basis = "period" | "cumulative" | "balance"
const PERIOD_ROWS: Record<MonthlyKind, [string, string, Basis][]> = {
  financial_statement: [
    ["capital_deposited", "Capital deposited", "period"],
    ["capital_total", "Capital deposited", "cumulative"],
    ["loans_issued", "Loans issued", "cumulative"],
    ["capital_due", "Outstanding capital contribution", "balance"],
    ["capital_advance", "Capital paid in advance", "balance"],
  ],
  accrual_report: [
    ["interest_accrual", "Interest accrued (earned, not necessarily received)", "period"],
    ["service_charge", "Loan renewal / service charges", "period"],
    ["deposit_fine", "Fines paid with deposits", "period"],
    ["principal_outstanding", "Principal outstanding", "balance"],
  ],
}
const BASIS_STYLE: Record<Basis, string> = {
  period: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  cumulative: "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200",
  balance: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
}

function PeriodTotals({
  kind,
  totals,
  range,
  endDay,
}: {
  kind: MonthlyKind
  totals: Record<string, Money>
  range: string
  endDay: string
}) {
  const basisLabel: Record<Basis, string> = {
    period: t("During the period"),
    cumulative: t("Cumulative to {0}", endDay),
    balance: t("As at {0}", endDay),
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("Period summary")}</CardTitle>
        <CardDescription className="text-xs">{range}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {PERIOD_ROWS[kind].map(([key, label, basis]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 border-b py-2 text-sm">
              <dt className="text-muted-foreground">
                {t(label)}{" "}
                <span
                  className={cn(
                    "ml-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium",
                    BASIS_STYLE[basis],
                  )}
                >
                  {basisLabel[basis]}
                </span>
              </dt>
              <dd className="font-nums font-medium">{formatRs(totals[key])}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
