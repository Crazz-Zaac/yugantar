import { t, n } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileDown,
  FileSignature,
  Landmark,
  Pencil,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { downloadPolicyRecord } from "@/lib/download"
import { toast } from "sonner"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { apiClient } from "@/api/api"
import { formatDate, formatDateTime, parseUtc } from "@/lib/datetime"
import { formatRs } from "@/lib/money"
import { timeLeft, type PolicyType, type SigningSummary, type SigningTarget } from "./signing"

type Status = "draft" | "finalized" | "active" | "expired" | "void"

export interface BoardDepositPolicy {
  policy_id: string
  amount_paisa: number
  late_deposit_fine: number
  schedule_type: "monthly_fixed_day" | "occasional"
  due_day_of_month: number | null
  allowed_months: number | null
  status: Status
  effective_from: string
  effective_to: string | null
  signing_deadline?: string | null
}

export interface BoardLoanPolicy {
  policy_id: string
  min_loan_amount: number
  max_loan_amount: number
  interest_rate: number
  grace_period_days: number | null
  max_renewals: number | null
  requires_collateral: boolean
  emi_applicable: boolean
  status: Status
  effective_from: string
  effective_to: string | null
  signing_deadline?: string | null
}

export type BoardItem =
  | { type: "deposit"; policy: BoardDepositPolicy }
  | { type: "loan"; policy: BoardLoanPolicy }
type Item = BoardItem

interface Props {
  deposit: BoardDepositPolicy[]
  loan: BoardLoanPolicy[]
  canManage: boolean
  reloadKey: number
  busy: boolean
  onOpenSignatures: (target: SigningTarget) => void
  onOpenForSigning: (type: PolicyType, id: string) => void
  onEdit: (item: Item) => void
  onDelete: (type: PolicyType, id: string) => void
}

// ─── Plain-language descriptions ─────────────────────────────────────────────

function title(item: Item): string {
  if (item.type === "deposit") {
    const p = item.policy
    const amount = formatRs(Number(p.amount_paisa) / 100)
    return p.schedule_type === "monthly_fixed_day" ? t("{0} every month", amount) : t("{0} occasional deposit", amount)
  }
  const p = item.policy
  return t("Loans of {0} – {1}", formatRs(p.min_loan_amount), formatRs(p.max_loan_amount))
}

function facts(item: Item): string[] {
  if (item.type === "deposit") {
    const p = item.policy
    return [
      p.schedule_type === "monthly_fixed_day"
        ? p.due_day_of_month
          ? t("Due on day {0} of each month", p.due_day_of_month)
          : t("Due day not set")
        : p.allowed_months
          ? p.allowed_months === 1
            ? t("Within {0} month", 1)
            : t("Within {0} months", p.allowed_months)
          : t("Period not set"),
      Number(p.late_deposit_fine)
        ? t(
            "Late fine {0}% ({1})",
            Number(p.late_deposit_fine),
            formatRs(Math.round((Number(p.amount_paisa) * Number(p.late_deposit_fine)) / 100) / 100),
          )
        : t("No late fine"),
    ]
  }
  const p = item.policy
  return [
    t("{0}% interest per year", Number(p.interest_rate)),
    p.grace_period_days ? t("{0} days' grace", p.grace_period_days) : t("No grace period"),
    p.max_renewals
      ? p.max_renewals === 1
        ? t("Up to {0} renewal", 1)
        : t("Up to {0} renewals", p.max_renewals)
      : t("No renewals"),
    p.requires_collateral ? t("Guarantor required") : t("No guarantor needed"),
    ...(p.emi_applicable ? [t("EMI available")] : []),
  ]
}

const label = (item: Item) =>
  item.type === "deposit" ? t("Deposit policy: {0}", title(item)) : t("Loan policy: {0}", title(item))

const TypeIcon = ({ type }: { type: PolicyType }) => {
  const Icon = type === "deposit" ? Landmark : CreditCard
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${type === "deposit" ? "bg-primary/10 text-primary" : "bg-chart-2/10 text-chart-2"}`}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

/** Download the adoption record (letterhead PDF) of an adopted policy. */
function RecordButton({ item, reference }: { item: Item; reference?: string | null }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      disabled={busy}
      title={t("Download the adoption record (PDF)")}
      onClick={() => {
        setBusy(true)
        downloadPolicyRecord(item.type, item.policy.policy_id, reference)
          .catch(() => toast.error(t("Couldn't download the record.")))
          .finally(() => setBusy(false))
      }}
    >
      <FileDown className="mr-1 h-3.5 w-3.5" /> {t(" PDF")}</Button>
  )
}

function SectionHeading({ icon: Icon, children, count }: { icon: typeof Clock; children: React.ReactNode; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{n(count)}</span>
    </h3>
  )
}

const endPassed = (to: string | null) => {
  const d = parseUtc(to)
  return !!d && d.getTime() < Date.now()
}

// ─── Board ───────────────────────────────────────────────────────────────────

export function PolicyBoard({ deposit, loan, canManage, reloadKey, busy, onOpenSignatures, onOpenForSigning, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<"all" | PolicyType>("all")
  const [summaries, setSummaries] = useState<Record<string, SigningSummary>>({})
  // Deposits strictly use one current deposit policy; other active ones are superseded
  const [currentDepositId, setCurrentDepositId] = useState<string | null>(null)

  const items: Item[] = useMemo(
    () => [
      ...deposit.map((policy) => ({ type: "deposit" as const, policy })),
      ...loan.map((policy) => ({ type: "loan" as const, policy })),
    ],
    [deposit, loan],
  )

  // Signing progress for open and in-force policies
  useEffect(() => {
    let cancelled = false
    const wanted = items.filter((i) => i.policy.status === "finalized" || i.policy.status === "active")
    Promise.all(
      wanted.map((i) =>
        apiClient
          .get(`/policies/${i.type}/${i.policy.policy_id}/signatures`)
          .then((r) => r.data as SigningSummary)
          .catch(() => null),
      ),
    ).then((list) => {
      if (cancelled) return
      const map: Record<string, SigningSummary> = {}
      list.forEach((s) => s && (map[s.policy_id] = s))
      setSummaries(map)
    })
    return () => {
      cancelled = true
    }
  }, [items, reloadKey])

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/policies/deposit/current")
      .then((r) => !cancelled && setCurrentDepositId((r.data as { policy_id: string } | null)?.policy_id ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const visible = items.filter((i) => filter === "all" || i.type === filter)
  const open = visible.filter((i) => i.policy.status === "finalized")
  const active = visible.filter((i) => i.policy.status === "active")
  const drafts = visible.filter((i) => i.policy.status === "draft")
  const past = visible.filter((i) => i.policy.status === "void" || i.policy.status === "expired")
  const target = (i: Item): SigningTarget => ({ type: i.type, id: i.policy.policy_id, label: label(i) })

  return (
    <div className="flex flex-col gap-8">
      {/* Type filter */}
      <div className="flex gap-1 self-start rounded-lg bg-muted p-1" role="tablist" aria-label={t("Policy type")}>
        {(
          [
            ["all", "All policies", null],
            ["deposit", "Deposit", Landmark],
            ["loan", "Loan", CreditCard],
          ] as const
        ).map(([id, text, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {t(text)}
          </button>
        ))}
      </div>

      {/* 1 ── Open for signing ─────────────────────────────── */}
      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={FileSignature} count={open.length}>
            {t("Open for signing")}</SectionHeading>
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map((i) => {
              const s = summaries[i.policy.policy_id]
              const left = timeLeft(s?.signing_deadline ?? i.policy.signing_deadline)
              const mine = s?.my_status
              return (
                <Card key={i.policy.policy_id} className="border-primary/40 bg-gradient-to-br from-primary/[0.06] to-transparent">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-3">
                      <TypeIcon type={i.type} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground">{i.type === "deposit" ? t("New deposit policy") : t("New loan policy")}</p>
                        <p className="text-base font-semibold">{title(i)}</p>
                        <p className="text-xs text-muted-foreground">{facts(i).join(" · ")}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>
                          <span className="font-semibold">{t("{0} of {1} members signed", s?.approved ?? "–", s?.required ?? "–")}</span>
                          {!!s?.rejected && <span className="text-destructive"> {t(" · {0} rejected", s.rejected)}</span>}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {left ?? t("closing")}
                        </span>
                      </div>
                      <Progress value={s?.required ? (s.approved / s.required) * 100 : 0} className="h-2" />
                      <p className="text-[11px] text-muted-foreground">
                        {t("Signing closes {0}. Every member must sign by then for it to take effect.", formatDateTime(s?.signing_deadline ?? i.policy.signing_deadline))}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {mine === "pending" ? (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning">
                          <AlertTriangle className="mr-1 h-3 w-3" /> {t(" You haven't signed yet")}</Badge>
                      ) : mine === "approved" ? (
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> {t(" You signed")}</Badge>
                      ) : mine === "rejected" ? (
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                          <XCircle className="mr-1 h-3 w-3" /> {t(" You rejected")}</Badge>
                      ) : (
                        <span />
                      )}
                      <Button size="sm" onClick={() => onOpenSignatures(target(i))}>
                        <Users className="mr-2 h-4 w-4" />
                        {mine === "pending" ? t("Review & sign") : t("See signatures")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* 2 ── In force ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHeading icon={CheckCircle2} count={active.length}>
          {t("In force")}</SectionHeading>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No active policies.")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((i) => {
              const s = summaries[i.policy.policy_id]
              const ended = endPassed(i.policy.effective_to)
              const isCurrent = i.type === "deposit" && i.policy.policy_id === currentDepositId
              const superseded = i.type === "deposit" && !!currentDepositId && !isCurrent
              return (
                <Card key={i.policy.policy_id} className={isCurrent ? "border-primary/50 ring-1 ring-primary/30" : superseded ? "opacity-75" : undefined}>
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <TypeIcon type={i.type} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug">{title(i)}</p>
                        <p className="text-xs text-muted-foreground">{t("Since {0}", formatDate(i.policy.effective_from))}</p>
                      </div>
                      {isCurrent && (
                        <Badge variant="outline" className="shrink-0 border-primary/40 bg-primary/10 text-[11px] text-primary">
                          {t("Current")}</Badge>
                      )}
                      {superseded && (
                        <Badge variant="outline" className="shrink-0 text-[11px] text-muted-foreground">
                          {t("Superseded")}</Badge>
                      )}
                    </div>
                    {superseded && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("Deposits use the newer current policy. The Treasurer can end this one.")}</p>
                    )}
                    <ul className="flex flex-wrap gap-1.5">
                      {facts(i).map((f) => (
                        <li key={f} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {f}
                        </li>
                      ))}
                    </ul>
                    {ended && (
                      <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning-foreground dark:text-warning">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        {t("End date ")}{formatDate(i.policy.effective_to)} {t(" has passed, but it's still marked active. The Treasurer should review it.")}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
                      {s && s.required > 0 ? (
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenSignatures(target(i))}>
                          {t("Signed by {0} members", s.approved)}</button>
                      ) : (
                        <span className="text-muted-foreground">{t("Adopted before member signing")}</span>
                      )}
                      <RecordButton item={i} reference={s?.record_reference} />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* 3 ── Drafts (Treasurer) ───────────────────────────── */}
      {canManage && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Pencil} count={drafts.length}>
            {t("Drafts")}</SectionHeading>
          {drafts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("No drafts. Use “Create policy” to start one.")}</p>
          ) : (
            <div className="flex flex-col divide-y rounded-xl border bg-card">
              {drafts.map((i) => (
                <div key={i.policy.policy_id} className="flex flex-wrap items-center gap-3 p-4">
                  <TypeIcon type={i.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{title(i)}</p>
                    <p className="text-xs text-muted-foreground">{facts(i).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(i)} aria-label={t("Edit draft")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(i.type, i.policy.policy_id)} aria-label={t("Delete draft")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => onOpenForSigning(i.type, i.policy.policy_id)}>
                      <Send className="mr-2 h-4 w-4" />
                      {t("Sign & open")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 4 ── Not adopted / ended ──────────────────────────── */}
      {past.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            {t("Not adopted or ended")}<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{n(past.length)}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 flex flex-col divide-y rounded-xl border bg-card">
              {past.map((i) => (
                <div key={i.policy.policy_id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <TypeIcon type={i.type} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{title(i)}</p>
                    <p className="text-xs text-muted-foreground">{facts(i).join(" · ")}</p>
                  </div>
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    {i.policy.status === "void" ? t("Not adopted") : t("Ended")}
                  </Badge>
                  {i.policy.status === "expired" && <RecordButton item={i} />}
                  {canManage && i.policy.status === "void" && (
                    <Button size="sm" variant="ghost" onClick={() => onOpenSignatures(target(i))}>
                      {t("Revise")}</Button>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
