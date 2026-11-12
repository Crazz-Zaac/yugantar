import { t } from "@/lib/i18n"
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock, FileDown, FileText, Loader2, PenLine, PhoneCall, Undo2, XCircle } from "lucide-react"
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
import { useConfirm } from "@/components/confirm/confirmContext"
import { downloadPolicyPreview, downloadPolicyRecord } from "@/lib/download"
import { SignaturePad } from "@/components/signature/SignaturePad"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

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

/** A member's hand signature, loaded with the user's session (not a public URL). */
function SignatureThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    apiClient
      .get(url, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data as Blob)
        setSrc(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])
  if (!src) return <span className="inline-block h-10 w-24 animate-pulse rounded bg-muted" />
  return (
    <span className="inline-flex rounded border bg-white px-1.5 py-0.5">
      <img src={src} alt={t("Hand signature")} className="h-9 max-w-[9rem] object-contain" />
    </span>
  )
}

function SignatureRow({ sig, imageUrl }: { sig: Signature; imageUrl: string }) {
  return (
    <li className={`flex gap-3 py-2.5 ${sig.counted ? "" : "opacity-50"}`}>
      <StatusIcon status={sig.status} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{sig.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(sig.roles)}</span>
          {!sig.counted && <span className="text-xs text-muted-foreground">{t("(account disabled, not counted)")}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {sig.status === "pending"
            ? t("Not signed yet")
            : `${sig.status === "approved" ? t("Signed") : t("Rejected")} ${formatDateTime(sig.signed_at)}`}
        </p>
        {sig.reason && <p className="mt-0.5 text-xs">“{sig.reason}”</p>}
        {sig.has_signature_image && sig.status === "approved" && (
          <div className="mt-1.5">
            <SignatureThumb url={imageUrl} />
          </div>
        )}
        {sig.proxy && (
          <p className="mt-1 flex gap-1.5 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <PhoneCall className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {t("Signed by Admin {0} on their behalf ({1}); authorised by {2}.", sig.proxy.requested_by_name, sig.proxy.consultation_note, sig.proxy.authorisations
                .filter((a) => a.approved)
                .map((a) => a.name)
                .join(", "))}</span>
          </p>
        )}
      </div>
    </li>
  )
}

export default function PolicySigningDialog({ target, onClose, onChanged, canWithdraw, canRequestProxy }: Props) {
  const confirm = useConfirm()
  const { user } = useAuth()
  const [signature, setSignature] = useState<string | null>(null)
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
      setError(apiError(err, t("Could not load signatures.")))
    } finally {
      setLoading(false)
    }
  }, [target, base])

  useEffect(() => {
    setSummary(null)
    setNotice(null)
    setRejecting(false)
    setRejectReason("")
    setSignature(null)
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
      setError(apiError(err, t("Something went wrong.")))
      return false
    } finally {
      setBusy(false)
    }
  }

  const sign = (decision: SignatureStatus) =>
    run(
      () =>
        apiClient.post(`${base}/sign`, {
          decision,
          reason: decision === "rejected" ? rejectReason : null,
          signature_image: decision === "approved" ? signature : null,
        }),
      decision === "approved" ? t("You signed this policy.") : t("Your rejection was recorded."),
    ).then((ok) => {
      if (ok) {
        setRejecting(false)
        setSignature(null)
      }
    })

  const withdraw = async () => {
    const answer = await confirm({
      title: t("Move this policy back to draft?"),
      description:
        t("All signatures collected so far will be cleared, and members will need to sign again once you reopen it."),
      confirmLabel: t("Move to draft"),
      destructive: true,
    })
    if (!answer.confirmed) return
    return run(() => apiClient.post(`${base}/withdraw`), t("Policy moved back to draft for revision."))
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
      t("Proxy request sent. It takes effect once the President, Treasurer and Secretary authorise it."),
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
          <DialogTitle>{summary?.title || target?.label || t("Policy")}</DialogTitle>
          <DialogDescription>
            {t("Read the policy below before signing. Members have one week to sign. It takes effect only if every member has signed by the deadline, and anyone can change their decision until then.")}</DialogDescription>
        </DialogHeader>

        {loading && !summary && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {summary && (
          <div className="flex flex-col gap-4">
            {/* What the policy is */}
            <section className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" /> {t(" The policy")}</h3>
                {summary.record_available && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      downloadPolicyRecord(summary.policy_type, summary.policy_id, summary.record_reference)
                        .then(() => load())
                        .catch(() => toast.error(t("Couldn't download the record.")))
                    }
                  >
                    <FileDown className="mr-1.5 h-4 w-4" />
                    {t("Adoption record (PDF)")}</Button>
                )}
                {summary.preview_available && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    title={t("The record as it stands now, with the signatures so far (marked PREVIEW)")}
                    onClick={() =>
                      downloadPolicyPreview(summary.policy_type, summary.policy_id).catch(() =>
                        toast.error(t("Couldn't create the preview.")),
                      )
                    }
                  >
                    <FileDown className="mr-1.5 h-4 w-4" />
                    {t("Preview PDF")}</Button>
                )}
              </div>
              {/* Nepali is the wording members sign; English is for reference */}
              <p lang="ne" className="text-sm leading-relaxed">
                {summary.statement_ne || summary.statement}
              </p>
              {summary.statement_ne && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">{t("Read in English")}</summary>
                  <p className="mt-1 leading-relaxed">{summary.statement}</p>
                </details>
              )}
              {summary.terms.length > 0 && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-3 sm:grid-cols-2">
                  {summary.terms.map((term) => (
                    <div key={term.label} className="flex flex-col">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {term.label}
                      </dt>
                      <dd className="text-sm font-medium">{term.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {summary.record_reference && (
                <p className="mt-3 text-[11px] text-muted-foreground">{t("Record reference: {0}", summary.record_reference)}</p>
              )}
            </section>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-semibold">{t("{0} of {1} members signed", summary.approved, summary.required)}</span>{summary.rejected > 0 && <span className="text-destructive"> {t(" · {0} rejected", summary.rejected)}</span>}
                </span>
                <Badge variant="outline" className="capitalize">
                  {summary.status === "finalized" ? t("Open for signing") : summary.status}
                </Badge>
              </div>
              <Progress value={summary.required ? (summary.approved / summary.required) * 100 : 0} />
              {summary.signing_deadline && (
                <p className="text-xs text-muted-foreground">
                  {isOpen
                    ? t("Signing closes {0} ({1}).", formatDateTime(summary.signing_deadline), timeLeft(summary.signing_deadline) ?? t("closing"))
                    : t("Signing closed {0}.", formatDateTime(summary.signing_deadline))}
                  {summary.status === "void" && t(" Not every member had signed, so the policy was not adopted.")}
                </p>
              )}
              {summary.rejected > 0 && isOpen && (
                <p className="text-xs text-muted-foreground">
                  {t("If a rejection still stands at the deadline, the policy is not adopted. The member can change their decision before then, or the Treasurer can withdraw and revise it.")}</p>
              )}
            </div>

            {/* My signature */}
            {isOpen && summary.my_status && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm">
                  {summary.my_status === "pending"
                    ? t("You haven't signed this policy yet.")
                    : summary.my_status === "approved"
                      ? t("You have signed this policy. You can change your decision until the deadline.")
                      : t("You rejected this policy. You can change your decision until the deadline.")}
                </p>
                {rejecting ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reject-reason" className="text-xs">
                      {t("Reason for rejecting (shared with the members)")}</Label>
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
                        {t("Reject policy")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                        {t("Cancel")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {summary.my_status !== "approved" && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-muted-foreground">
                          {user
                            ? t(
                                "Your hand signature · signing as {0} on {1}",
                                `${user.first_name} ${user.last_name}`,
                                formatDateTime(new Date().toISOString()),
                              )
                            : t("Your hand signature")}
                        </p>
                        <SignaturePad onChange={setSignature} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {summary.my_status !== "approved" && (
                        <Button size="sm" disabled={busy || !signature} onClick={() => sign("approved")}>
                          <PenLine className="mr-2 h-4 w-4" />
                          {t("Sign (approve)")}</Button>
                      )}
                      {summary.my_status !== "rejected" && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                          <XCircle className="mr-2 h-4 w-4" />
                          {t("Reject")}</Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {notice && <p className="text-sm text-success">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <ul className="divide-y rounded-md border px-3">
              {summary.signatures.map((sig) => (
                <SignatureRow key={sig.user_id} sig={sig} imageUrl={`${base}/signatures/${sig.user_id}/image`} />
              ))}
              {summary.signatures.length === 0 && (
                <li className="py-4 text-center text-sm text-muted-foreground">
                  {t("No signatures yet. The Treasurer opens a draft for signing.")}</li>
              )}
            </ul>

            {/* Admin: proxy signature for an absent member */}
            {isOpen && canRequestProxy && pendingSigners.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                {!proxyOpen ? (
                  <Button size="sm" variant="outline" onClick={() => setProxyOpen(true)}>
                    <PhoneCall className="mr-2 h-4 w-4" />
                    {t("Sign on behalf of an absent member…")}</Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      {t("Extreme cases only. Consult the member first (e.g. by phone). The signature is recorded only after the President, Treasurer and Secretary each authorise it, and the member is notified.")}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">{t("Absent member")}</Label>
                        <Select value={proxySigner} onValueChange={setProxySigner}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("Choose member")} />
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
                        <Label className="text-xs">{t("Their decision")}</Label>
                        <Select value={proxyDecision} onValueChange={(v) => setProxyDecision(v as SignatureStatus)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved">{t("Approve (sign)")}</SelectItem>
                            <SelectItem value="rejected">{t("Reject")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {proxyDecision === "rejected" && (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">{t("Their reason for rejecting")}</Label>
                        <Textarea
                          value={proxyReason}
                          maxLength={500}
                          onChange={(e) => setProxyReason(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">{t("How was the member consulted?")}</Label>
                      <Textarea
                        placeholder={t("e.g. Spoke by phone on 12 Nov; agreed to the new deposit amount")}
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
                        {t("Send for authorisation")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setProxyOpen(false)}>
                        {t("Cancel")}</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canRevise && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" disabled={busy} onClick={withdraw}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  {isOpen ? t("Withdraw to draft to revise") : t("Revise as a new draft")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
