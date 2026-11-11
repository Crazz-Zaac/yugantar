import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
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
    return p.schedule_type === "monthly_fixed_day" ? `${amount} every month` : `${amount} occasional deposit`
  }
  const p = item.policy
  return `Loans of ${formatRs(p.min_loan_amount)} – ${formatRs(p.max_loan_amount)}`
}

function facts(item: Item): string[] {
  if (item.type === "deposit") {
    const p = item.policy
    return [
      p.schedule_type === "monthly_fixed_day"
        ? p.due_day_of_month
          ? `Due on day ${p.due_day_of_month} of each month`
          : "Due day not set"
        : p.allowed_months
          ? `Within ${p.allowed_months} month${p.allowed_months === 1 ? "" : "s"}`
          : "Period not set",
      `Late fine ${Number(p.late_deposit_fine)}%`,
    ]
  }
  const p = item.policy
  return [
    `${Number(p.interest_rate)}% interest per year`,
    p.grace_period_days ? `${p.grace_period_days} days' grace` : "No grace period",
    p.max_renewals ? `Up to ${p.max_renewals} renewal${p.max_renewals === 1 ? "" : "s"}` : "No renewals",
    p.requires_collateral ? "Collateral required" : "No collateral",
    ...(p.emi_applicable ? ["EMI available"] : []),
  ]
}

const label = (item: Item) => `${item.type === "deposit" ? "Deposit" : "Loan"} policy: ${title(item)}`

const TypeIcon = ({ type }: { type: PolicyType }) => {
  const Icon = type === "deposit" ? Landmark : CreditCard
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${type === "deposit" ? "bg-primary/10 text-primary" : "bg-chart-2/10 text-chart-2"}`}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

function SectionHeading({ icon: Icon, children, count }: { icon: typeof Clock; children: React.ReactNode; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{count}</span>
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
      <div className="flex gap-1 self-start rounded-lg bg-muted p-1" role="tablist" aria-label="Policy type">
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
            {text}
          </button>
        ))}
      </div>

      {/* 1 ── Open for signing ─────────────────────────────── */}
      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={FileSignature} count={open.length}>
            Open for signing
          </SectionHeading>
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
                        <p className="text-xs font-medium text-muted-foreground">{i.type === "deposit" ? "New deposit policy" : "New loan policy"}</p>
                        <p className="text-base font-semibold">{title(i)}</p>
                        <p className="text-xs text-muted-foreground">{facts(i).join(" · ")}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>
                          <span className="font-semibold">{s?.approved ?? "–"}</span>
                          <span className="text-muted-foreground"> of {s?.required ?? "–"} members signed</span>
                          {!!s?.rejected && <span className="text-destructive"> · {s.rejected} rejected</span>}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {left ?? "closing"}
                        </span>
                      </div>
                      <Progress value={s?.required ? (s.approved / s.required) * 100 : 0} className="h-2" />
                      <p className="text-[11px] text-muted-foreground">
                        Signing closes {formatDateTime(s?.signing_deadline ?? i.policy.signing_deadline)}. Every member must sign by then for it to take effect.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {mine === "pending" ? (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning">
                          <AlertTriangle className="mr-1 h-3 w-3" /> You haven't signed yet
                        </Badge>
                      ) : mine === "approved" ? (
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> You signed
                        </Badge>
                      ) : mine === "rejected" ? (
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                          <XCircle className="mr-1 h-3 w-3" /> You rejected
                        </Badge>
                      ) : (
                        <span />
                      )}
                      <Button size="sm" onClick={() => onOpenSignatures(target(i))}>
                        <Users className="mr-2 h-4 w-4" />
                        {mine === "pending" ? "Review & sign" : "See signatures"}
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
          In force
        </SectionHeading>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No active policies.</p>
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
                        <p className="text-xs text-muted-foreground">Since {formatDate(i.policy.effective_from)}</p>
                      </div>
                      {isCurrent && (
                        <Badge variant="outline" className="shrink-0 border-primary/40 bg-primary/10 text-[11px] text-primary">
                          Current
                        </Badge>
                      )}
                      {superseded && (
                        <Badge variant="outline" className="shrink-0 text-[11px] text-muted-foreground">
                          Superseded
                        </Badge>
                      )}
                    </div>
                    {superseded && (
                      <p className="text-[11px] text-muted-foreground">
                        Deposits use the newer current policy. The Treasurer can end this one.
                      </p>
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
                        End date {formatDate(i.policy.effective_to)} has passed, but it's still marked active. The Treasurer should review it.
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
                      {s && s.required > 0 ? (
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenSignatures(target(i))}>
                          Signed by {s.approved} members
                        </button>
                      ) : (
                        <span className="text-muted-foreground">Adopted before member signing</span>
                      )}
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
            Drafts
          </SectionHeading>
          {drafts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No drafts. Use “Create policy” to start one.
            </p>
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
                    <Button size="sm" variant="ghost" onClick={() => onEdit(i)} aria-label="Edit draft">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(i.type, i.policy.policy_id)} aria-label="Delete draft">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => onOpenForSigning(i.type, i.policy.policy_id)}>
                      <Send className="mr-2 h-4 w-4" />
                      Sign & open
                    </Button>
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
            Not adopted or ended
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{past.length}</span>
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
                    {i.policy.status === "void" ? "Not adopted" : "Ended"}
                  </Badge>
                  {canManage && i.policy.status === "void" && (
                    <Button size="sm" variant="ghost" onClick={() => onOpenSignatures(target(i))}>
                      Revise
                    </Button>
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
