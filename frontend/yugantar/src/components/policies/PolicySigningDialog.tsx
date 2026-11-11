import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock, Loader2, PenLine, PhoneCall, Undo2, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/api/api"
import {
  apiError,
  formatDateTime,
  roleLabel,
  timeLeft,
  type Signature,
  type SignatureStatus,
  type SigningSummary,
  type SigningTarget,
} from "./signing"

interface Props {
  target: SigningTarget | null
  onClose: () => void
  /** Called after anything changed (sign, withdraw, proxy request). */
  onChanged?: () => void
  /** Treasurer: may withdraw an open policy back to draft. */
  canWithdraw?: boolean
  /** Admin: may request to sign on behalf of an absent member. */
  canRequestProxy?: boolean
}

function StatusIcon({ status }: { status: SignatureStatus }) {
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-success" />
  if (status === "rejected") return <XCircle className="h-4 w-4 text-destructive" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

function SignatureRow({ sig }: { sig: Signature }) {
  return (
    <li className={`flex gap-3 py-2.5 ${sig.counted ? "" : "opacity-50"}`}>
      <StatusIcon status={sig.status} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{sig.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(sig.roles)}</span>
          {!sig.counted && <span className="text-xs text-muted-foreground">(account disabled, not counted)</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {sig.status === "pending"
            ? "Not signed yet"
            : `${sig.status === "approved" ? "Signed" : "Rejected"} ${formatDateTime(sig.signed_at)}`}
        </p>
        {sig.reason && <p className="mt-0.5 text-xs">“{sig.reason}”</p>}
        {sig.proxy && (
          <p className="mt-1 flex gap-1.5 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <PhoneCall className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Signed by Admin {sig.proxy.requested_by_name} on their behalf ({sig.proxy.consultation_note}); authorised
              by {sig.proxy.authorisations.filter((a) => a.approved).map((a) => a.name).join(", ")}.
            </span>
          </p>
        )}
      </div>
    </li>
  )
}

export default function PolicySigningDialog({ target, onClose, onChanged, canWithdraw, canRequestProxy }: Props) {
  const [summary, setSummary] = useState<SigningSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const [proxyOpen, setProxyOpen] = useState(false)
  const [proxySigner, setProxySigner] = useState("")
  const [proxyDecision, setProxyDecision] = useState<SignatureStatus>("approved")
  const [proxyReason, setProxyReason] = useState("")
  const [proxyNote, setProxyNote] = useState("")

  const base = target ? `/policies/${target.type}/${target.id}` : ""

  const load = useCallback(async () => {
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get(`${base}/signatures`)
      setSummary(res.data as SigningSummary)
    } catch (err) {
      setError(apiError(err, "Could not load signatures."))
    } finally {
      setLoading(false)
    }
  }, [target, base])

  useEffect(() => {
    setSummary(null)
    setNotice(null)
    setRejecting(false)
    setRejectReason("")
    setProxyOpen(false)
    load()
  }, [load])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
      await load()
      onChanged?.()
      return true
    } catch (err) {
      setError(apiError(err, "Something went wrong."))
      return false
    } finally {
      setBusy(false)
    }
  }

  const sign = (decision: SignatureStatus) =>
    run(
      () => apiClient.post(`${base}/sign`, { decision, reason: decision === "rejected" ? rejectReason : null }),
      decision === "approved" ? "You signed this policy." : "Your rejection was recorded.",
    ).then((ok) => ok && setRejecting(false))

  const withdraw = () => {
    if (!window.confirm("Move this policy back to draft to revise it? All signatures collected so far will be cleared.")) return
    return run(() => apiClient.post(`${base}/withdraw`), "Policy moved back to draft for revision.")
  }

  const requestProxy = () =>
    run(
      () =>
        apiClient.post(`${base}/proxy-requests`, {
          signer_user_id: proxySigner,
          decision: proxyDecision,
          reason: proxyDecision === "rejected" ? proxyReason : null,
          consultation_note: proxyNote,
        }),
      "Proxy request sent. It takes effect once the President, Treasurer and Secretary authorise it.",
    ).then((ok) => {
      if (ok) {
        setProxyOpen(false)
        setProxySigner("")
        setProxyReason("")
        setProxyNote("")
      }
    })

  // Open = still within the signing week (the backend closes it at the deadline)
  const isOpen = summary?.status === "finalized" && !summary.deadline_passed
  const canRevise = canWithdraw && (isOpen || summary?.status === "void")
  const pendingSigners = summary?.signatures.filter((s) => s.status === "pending" && s.counted) ?? []

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Member signatures</DialogTitle>
          <DialogDescription>
            {target?.label}. Members have one week to sign. It takes effect only if every member has signed by the
            deadline, and anyone can change their decision until then.
          </DialogDescription>
        </DialogHeader>

        {loading && !summary && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {summary && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-semibold">{summary.approved}</span> of {summary.required} members signed
                  {summary.rejected > 0 && (
                    <span className="text-destructive"> · {summary.rejected} rejected</span>
                  )}
                </span>
                <Badge variant="outline" className="capitalize">
                  {summary.status === "finalized" ? "Open for signing" : summary.status}
                </Badge>
              </div>
              <Progress value={summary.required ? (summary.approved / summary.required) * 100 : 0} />
              {summary.signing_deadline && (
                <p className="text-xs text-muted-foreground">
                  {isOpen
                    ? `Signing closes ${formatDateTime(summary.signing_deadline)} (${timeLeft(summary.signing_deadline) ?? "closing"}).`
                    : `Signing closed ${formatDateTime(summary.signing_deadline)}.`}
                  {summary.status === "void" && " Not every member had signed, so the policy was not adopted."}
                </p>
              )}
              {summary.rejected > 0 && isOpen && (
                <p className="text-xs text-muted-foreground">
                  If a rejection still stands at the deadline, the policy is not adopted. The member can change their
                  decision before then, or the Treasurer can withdraw and revise it.
                </p>
              )}
            </div>

            {/* My signature */}
            {isOpen && summary.my_status && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm">
                  {summary.my_status === "pending"
                    ? "You haven't signed this policy yet."
                    : summary.my_status === "approved"
                      ? "You have signed this policy. You can change your decision until the deadline."
                      : "You rejected this policy. You can change your decision until the deadline."}
                </p>
                {rejecting ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reject-reason" className="text-xs">
                      Reason for rejecting (shared with the members)
                    </Label>
                    <Textarea
                      id="reject-reason"
                      value={rejectReason}
                      maxLength={500}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || !rejectReason.trim()}
                        onClick={() => sign("rejected")}
                      >
                        Reject policy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.my_status !== "approved" && (
                      <Button size="sm" disabled={busy} onClick={() => sign("approved")}>
                        <PenLine className="mr-2 h-4 w-4" />
                        Sign (approve)
                      </Button>
                    )}
                    {summary.my_status !== "rejected" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {notice && <p className="text-sm text-success">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <ul className="divide-y rounded-md border px-3">
              {summary.signatures.map((sig) => (
                <SignatureRow key={sig.user_id} sig={sig} />
              ))}
              {summary.signatures.length === 0 && (
                <li className="py-4 text-center text-sm text-muted-foreground">
                  No signatures yet. The Treasurer opens a draft for signing.
                </li>
              )}
            </ul>

            {/* Admin: proxy signature for an absent member */}
            {isOpen && canRequestProxy && pendingSigners.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                {!proxyOpen ? (
                  <Button size="sm" variant="outline" onClick={() => setProxyOpen(true)}>
                    <PhoneCall className="mr-2 h-4 w-4" />
                    Sign on behalf of an absent member…
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      Extreme cases only. Consult the member first (e.g. by phone). The signature is recorded only after
                      the President, Treasurer and Secretary each authorise it, and the member is notified.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Absent member</Label>
                        <Select value={proxySigner} onValueChange={setProxySigner}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose member" />
                          </SelectTrigger>
                          <SelectContent>
                            {pendingSigners.map((s) => (
                              <SelectItem key={s.user_id} value={s.user_id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Their decision</Label>
                        <Select value={proxyDecision} onValueChange={(v) => setProxyDecision(v as SignatureStatus)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved">Approve (sign)</SelectItem>
                            <SelectItem value="rejected">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {proxyDecision === "rejected" && (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Their reason for rejecting</Label>
                        <Textarea value={proxyReason} maxLength={500} onChange={(e) => setProxyReason(e.target.value)} />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">How was the member consulted?</Label>
                      <Textarea
                        placeholder="e.g. Spoke by phone on 12 Nov; agreed to the new deposit amount"
                        value={proxyNote}
                        maxLength={1000}
                        onChange={(e) => setProxyNote(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={
                          busy ||
                          !proxySigner ||
                          proxyNote.trim().length < 5 ||
                          (proxyDecision === "rejected" && !proxyReason.trim())
                        }
                        onClick={requestProxy}
                      >
                        Send for authorisation
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setProxyOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canRevise && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" disabled={busy} onClick={withdraw}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  {isOpen ? "Withdraw to draft to revise" : "Revise as a new draft"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
