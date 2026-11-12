import { formatRs } from "@/lib/money"
import { t, n } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, PenLine, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiClient } from "@/api/api"
import PolicySigningDialog from "@/components/policies/PolicySigningDialog"
import ProxyRequestsPanel from "@/components/policies/ProxyRequestsPanel"
import { apiError, timeLeft, type PolicyType, type SigningSummary, type SigningTarget } from "@/components/policies/signing"

type Status = "draft" | "finalized" | "active" | "expired" | "void"

interface PolicyRow {
  type: PolicyType
  id: string
  label: string
  status: Status
  effectiveFrom: string
  createdBy: string | null
}

interface RawDeposit {
  policy_id: string
  amount_paisa: number | string
  schedule_type: string
  status: Status
  effective_from: string
  created_by: string | null
}

interface RawLoan {
  policy_id: string
  min_loan_amount: number | string
  max_loan_amount: number | string
  interest_rate: number | string
  status: Status
  effective_from: string
  created_by: string | null
}

const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  finalized: "Open for signing",
  active: "Active",
  expired: "Expired",
  void: "Void",
}

const STATUS_CLASS: Record<Status, string> = {
  draft: "border-warning/30 bg-warning/10 text-warning",
  finalized: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  active: "border-success/30 bg-success/10 text-success",
  expired: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
  void: "border-destructive/30 bg-destructive/10 text-destructive",
}

const rs = (v: number | string) => formatRs(v)

export function PoliciesTab() {
  const [rows, setRows] = useState<PolicyRow[]>([])
  const [progress, setProgress] = useState<Record<string, SigningSummary>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all")
  const [target, setTarget] = useState<SigningTarget | null>(null)
  const [proxyRefresh, setProxyRefresh] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dep, loan] = await Promise.all([apiClient.get("/policies/deposit"), apiClient.get("/policies/loan")])
      const all: PolicyRow[] = [
        ...(dep.data as RawDeposit[]).map((p) => ({
          type: "deposit" as const,
          id: p.policy_id,
          label: t("Deposit policy ({0}, {1})", rs(Number(p.amount_paisa) / 100), t(p.schedule_type === "occasional" ? "occasional" : "monthly")),
          status: p.status,
          effectiveFrom: p.effective_from,
          createdBy: p.created_by,
        })),
        ...(loan.data as RawLoan[]).map((p) => ({
          type: "loan" as const,
          id: p.policy_id,
          label: t("Loan policy ({0}–{1}, {2}%)", rs(p.min_loan_amount), rs(p.max_loan_amount), Number(p.interest_rate)),
          status: p.status,
          effectiveFrom: p.effective_from,
          createdBy: p.created_by,
        })),
      ]
      setRows(all)
      setError(null)

      // Signing progress for policies that are open
      const open = all.filter((r) => r.status === "finalized")
      const summaries = await Promise.all(
        open.map((r) =>
          apiClient
            .get(`/policies/${r.type}/${r.id}/signatures`)
            .then((res) => res.data as SigningSummary)
            .catch(() => null),
        ),
      )
      const map: Record<string, SigningSummary> = {}
      summaries.forEach((s) => s && (map[s.policy_id] = s))
      setProgress(map)
    } catch (err) {
      setError(apiError(err, t("Could not load policies.")))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => !q || r.label.toLowerCase().includes(q) || (r.createdBy ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(b.status === "finalized") - Number(a.status === "finalized"))
  }, [rows, search, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1))
    return c
  }, [rows])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("Policies")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("The Treasurer drafts policies; members then have one week to sign, and a policy takes effect only if every member has signed by the deadline. In extreme cases you can sign on behalf of an absent member, after consulting them and with the President's, Treasurer's and Secretary's authorisation.")}</p>
      </div>

      <ProxyRequestsPanel mode="admin" refreshKey={proxyRefresh} onChanged={load} />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">{t("All policies")}</CardTitle>
              <CardDescription>{t("{0} shown", filtered.length)}</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t("Search policies")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "finalized", "active", "draft", "void", "expired"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? t("All") : t(STATUS_LABEL[s])} ({n(counts[s] ?? 0)})
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("Policy")}</TableHead>
                  <TableHead className="text-xs">{t("Status")}</TableHead>
                  <TableHead className="text-xs">{t("Signatures")}</TableHead>
                  <TableHead className="text-xs">{t("Created by")}</TableHead>
                  <TableHead className="w-28 text-xs">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {t("No policies.")}</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const p = progress[r.id]
                    return (
                      <TableRow key={`${r.type}-${r.id}`}>
                        <TableCell className="text-sm">{r.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${STATUS_CLASS[r.status]}`}>
                            {t(STATUS_LABEL[r.status])}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-40">
                          {p ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs">
                                {p.approved}/{p.required} {t(" signed")}{p.rejected > 0 && <span className="text-destructive"> {t(" · {0} rejected", p.rejected)}</span>}
                              </span>
                              <Progress value={p.required ? (p.approved / p.required) * 100 : 0} className="h-1.5" />
                              {p.signing_deadline && (
                                <span className="text-xs text-muted-foreground">{timeLeft(p.signing_deadline) ?? t("closing")}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.createdBy ?? "—"}</TableCell>
                        <TableCell>
                          {(r.status === "finalized" || r.status === "active" || r.status === "void") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => setTarget({ type: r.type, id: r.id, label: r.label })}
                            >
                              <PenLine className="mr-1.5 h-3.5 w-3.5" />
                              {t("Signatures")}</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PolicySigningDialog
        target={target}
        onClose={() => setTarget(null)}
        onChanged={() => {
          load()
          setProxyRefresh((k) => k + 1)
        }}
        canRequestProxy
      />
    </div>
  )
}
