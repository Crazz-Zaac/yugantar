import { useCallback, useEffect, useState } from "react"
import { t } from "@/lib/i18n"
import { apiClient } from "@/api/api"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/datetime"
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"

interface PolicyLike {
  policy_id: string
  status: string
  amount_paisa?: number
  amount_rupees?: number | string
  min_loan_amount?: number | string
  max_loan_amount?: number | string
}

interface ChangeRequest {
  id: string
  policy_type: string
  policy_id: string
  policy_label: string
  status: "pending" | "approved" | "rejected"
  reason: string
  requested_by_name: string
  decided_by_name?: string | null
  decision_note?: string | null
  decided_at?: string | null
  created_at: string
}

interface Props {
  depositPolicies: PolicyLike[]
  loanPolicies: PolicyLike[]
  isTreasurer: boolean
  isPresident: boolean
  canView: boolean
  reloadKey: number
  onChanged: () => void
}

const rsFmt = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`
const errDetail = (e: unknown) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail

function labelFor(p: PolicyLike, type: "deposit" | "loan"): string {
  if (type === "deposit") {
    const rs = p.amount_paisa != null ? Number(p.amount_paisa) / 100 : Number(p.amount_rupees ?? 0)
    return `${t("Deposit policy")} (${rsFmt(rs)})`
  }
  const lo = Number(p.min_loan_amount ?? 0)
  const hi = Number(p.max_loan_amount ?? 0)
  return `${t("Loan policy")} (${rsFmt(lo)}–${rsFmt(hi)})`
}

export function PolicyRetirementPanel({
  depositPolicies,
  loanPolicies,
  isTreasurer,
  isPresident,
  canView,
  reloadKey,
  onChanged,
}: Props) {
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [selPolicy, setSelPolicy] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [noteById, setNoteById] = useState<Record<string, string>>({})
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiClient.get("/policy-changes")
      setRequests((res.data as ChangeRequest[]) ?? [])
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    if (canView) fetchRequests()
  }, [canView, reloadKey, fetchRequests])

  if (!canView) return null

  const pendingIds = new Set(requests.filter((r) => r.status === "pending").map((r) => r.policy_id))
  const active = [
    ...depositPolicies.filter((p) => p.status === "active").map((p) => ({ type: "deposit" as const, p })),
    ...loanPolicies.filter((p) => p.status === "active").map((p) => ({ type: "loan" as const, p })),
  ]
  const retireable = active.filter((a) => !pendingIds.has(a.p.policy_id))
  const pending = requests.filter((r) => r.status === "pending")
  const decided = requests.filter((r) => r.status !== "pending")

  const submitRequest = async () => {
    if (!selPolicy || !reason.trim()) return
    const [policy_type, policy_id] = selPolicy.split("|")
    setSubmitting(true)
    try {
      await apiClient.post("/policy-changes", { policy_type, policy_id, reason: reason.trim() })
      toast.success(t("Retirement request sent for the President's approval."))
      setReason("")
      setSelPolicy("")
      await fetchRequests()
      onChanged()
    } catch (e) {
      toast.error(errDetail(e) ?? t("Could not send the request."))
    } finally {
      setSubmitting(false)
    }
  }

  const decide = async (id: string, action: "approve" | "reject") => {
    setDecidingId(id)
    try {
      await apiClient.post(`/policy-changes/${id}/${action}`, { note: noteById[id]?.trim() || null })
      toast.success(action === "approve" ? t("Policy retired.") : t("Retirement request rejected."))
      await fetchRequests()
      onChanged()
    } catch (e) {
      toast.error(errDetail(e) ?? t("Action failed."))
    } finally {
      setDecidingId(null)
    }
  }

  const statusBadge = (s: ChangeRequest["status"]) =>
    s === "approved" ? (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[11px]">
        <CheckCircle2 className="mr-1 h-3 w-3" /> {t("Retired")}</Badge>
    ) : s === "rejected" ? (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[11px]">
        <XCircle className="mr-1 h-3 w-3" /> {t("Rejected")}</Badge>
    ) : (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 text-[11px]">
        <Clock className="mr-1 h-3 w-3" /> {t("Pending")}</Badge>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {t("Policy retirement")}</CardTitle>
        <CardDescription>
          {t("The Treasurer requests retiring a policy; the President approves. Every request is logged.")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Treasurer: request a retirement */}
        {isTreasurer && retireable.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            <Label className="text-xs font-medium">{t("Request to retire a policy")}</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={selPolicy}
              onChange={(e) => setSelPolicy(e.target.value)}
            >
              <option value="">{t("Select a policy…")}</option>
              {retireable.map((a) => (
                <option key={a.p.policy_id} value={`${a.type}|${a.p.policy_id}`}>
                  {labelFor(a.p, a.type)}
                </option>
              ))}
            </select>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Why should this policy be retired?")}
              maxLength={500}
              className="min-h-16 text-sm"
            />
            <Button size="sm" className="self-start" disabled={!selPolicy || !reason.trim() || submitting} onClick={submitRequest}>
              {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t("Send for approval")}</Button>
          </div>
        )}

        {/* Pending requests (President acts, others watch) */}
        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Awaiting President approval")}</p>
            {pending.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.policy_label}</p>
                    <p className="text-xs text-muted-foreground">{t("Requested by {0}", r.requested_by_name)} · {formatDateTime(r.created_at)}</p>
                  </div>
                  {statusBadge(r.status)}
                </div>
                <p className="text-xs text-foreground/90">{t("Reason:")} {r.reason}</p>
                {isPresident ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={noteById[r.id] ?? ""}
                      onChange={(e) => setNoteById((m) => ({ ...m, [r.id]: e.target.value }))}
                      placeholder={t("Optional note (shown to the Treasurer)…")}
                      maxLength={500}
                      className="min-h-12 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={decidingId === r.id} onClick={() => decide(r.id, "approve")}>
                        {decidingId === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                        {t("Approve & retire")}</Button>
                      <Button size="sm" variant="outline" className="text-destructive" disabled={decidingId === r.id} onClick={() => decide(r.id, "reject")}>
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        {t("Reject")}</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("Waiting for the President to decide.")}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Audit log of decided requests */}
        {decided.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("History")}</p>
            <div className="flex flex-col divide-y rounded-lg border">
              {decided.map((r) => (
                <div key={r.id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{r.policy_label}</p>
                    {statusBadge(r.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("Requested by {0}", r.requested_by_name)}
                    {r.decided_by_name ? ` · ${t("decided by {0}", r.decided_by_name)}` : ""}
                    {r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ""}
                  </p>
                  <p className="text-xs text-foreground/80">{t("Reason:")} {r.reason}</p>
                  {r.decision_note && <p className="text-xs text-muted-foreground">{t("Note:")} {r.decision_note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {pending.length === 0 && decided.length === 0 && (!isTreasurer || retireable.length === 0) && (
          <p className="py-2 text-center text-xs text-muted-foreground">{t("No retirement requests.")}</p>
        )}
      </CardContent>
    </Card>
  )
}
