import { n, t } from "@/lib/i18n"
import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  FileText,
  Loader2,
  MapPin,
  PenLine,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Undo2,
  Users,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/confirm/confirmContext"
import { apiError } from "@/components/policies/signing"
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime"
import { cn } from "@/lib/utils"
import { MinutesEditor } from "./MinutesEditor"
import { SignatureDialog } from "@/components/signature/SignatureDialog"
import { SignatureThumb } from "@/components/signature/SignatureThumb"
import {
  approveMinutes,
  CATEGORY_LABEL,
  declineMinutes,
  signatureImageUrl,
  signMinutes,
  downloadMinutesPdf,
  getMinutes,
  listMinutes,
  listResolutions,
  returnMinutes,
  submitMinutes,
  type Minutes,
  type MinutesSummary,
  type Resolution,
} from "./minutes"

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-900 dark:bg-slate-500/20 dark:text-slate-200" },
  submitted: {
    label: "Awaiting approval",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  },
  approved: {
    label: "Approved · collecting signatures",
    className: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  },
  signed: {
    label: "Signed by all",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", s.className)}>{t(s.label)}</span>
}

function ResultBadge({ passed, unanimous }: { passed: boolean; unanimous: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        passed
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
          : "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200",
      )}
    >
      {passed ? (unanimous ? t("Passed (unanimous)") : t("Passed by majority")) : t("Not passed")}
    </span>
  )
}

export function MinutesPanel() {
  const [data, setData] = useState<{ items: MinutesSummary[]; can_write: boolean } | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ open: boolean; editing: Minutes | null }>({ open: false, editing: null })

  useEffect(() => {
    let cancelled = false
    listMinutes()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => setReloadKey((k) => k + 1)
  // Stable, so the viewer doesn't refetch on every render
  const closeView = useCallback(() => {
    setOpenId(null)
    setReloadKey((k) => k + 1)
  }, [])

  // Writing / editing takes the place of the list or the opened minutes
  if (editor.open) {
    return (
      <MinutesEditor
        editing={editor.editing}
        onClose={() => setEditor({ open: false, editing: null })}
        onSaved={(m) => {
          setEditor({ open: false, editing: null })
          reload()
          setOpenId(m.id)
        }}
      />
    )
  }

  if (openId) {
    return <MinutesView id={openId} onBack={closeView} onEdit={(m) => setEditor({ open: true, editing: m })} />
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{t("Couldn't load the minutes.")}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("Try again")}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return <Skeleton className="h-48 w-full" />

  const awaiting = data.items.filter((m) => m.can_review)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t(
            "The record of every meeting: attendance, what was discussed and concluded, and how each resolution was voted.",
          )}
        </p>
        {data.can_write && (
          <Button size="sm" onClick={() => setEditor({ open: true, editing: null })} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("Write minutes")}
          </Button>
        )}
      </div>

      {awaiting.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("Awaiting your approval")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {awaiting.map((m) => (
              <MinutesRow key={m.id} m={m} onOpen={() => setOpenId(m.id)} />
            ))}
          </CardContent>
        </Card>
      )}

      {data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground">
          {t("No minutes recorded yet.")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.items.map((m) => (
            <MinutesRow key={m.id} m={m} onOpen={() => setOpenId(m.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MinutesRow({ m, onOpen }: { m: MinutesSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {m.meeting_type === "online" ? <Video className="h-4 w-4" /> : <Users className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{m.title}</span>
          <StatusBadge status={m.status} />
          {m.needs_my_signature && (
            <span className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              <PenLine className="h-3 w-3" />
              {t("Needs your signature")}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(m.held_at)} · {t("{0} of {1} present", m.present, m.members_total)}
          {(m.status === "approved" || m.status === "signed") &&
            ` · ${t("{0} of {1} signed", m.signed_count, m.present)}`}
          {m.resolutions > 0 && ` · ${t("{0} of {1} resolutions passed", m.passed, m.resolutions)}`}
          {m.reference && ` · ${m.reference}`}
        </p>
      </div>
    </button>
  )
}

function MinutesView({
  id,
  onBack,
  onEdit,
}: {
  id: string
  onBack: () => void
  onEdit: (m: Minutes) => void
}) {
  const confirm = useConfirm()
  const [m, setM] = useState<Minutes | null>(null)
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMinutes(id)
      .then((x) => !cancelled && setM(x))
      .catch(() => !cancelled && onBack())
    return () => {
      cancelled = true
    }
  }, [id, onBack])

  const act = async (fn: () => Promise<Minutes>, done: string) => {
    setBusy(true)
    try {
      setM(await fn())
      toast.success(done)
    } catch (err) {
      toast.error(apiError(err, t("That didn't work.")))
    } finally {
      setBusy(false)
    }
  }

  if (!m) return <Skeleton className="h-64 w-full" />
  const present = m.attendees.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("All minutes")}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {m.can_edit && (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(m)} disabled={busy}>
                <Pencil className="mr-1.5 h-4 w-4" />
                {t("Edit")}
              </Button>
              <Button
                size="sm"
                onClick={() => act(() => submitMinutes(m.id), t("Submitted to the President for approval"))}
                disabled={busy}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {t("Submit for approval")}
              </Button>
            </>
          )}
          {m.can_review && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const answer = await confirm({
                    title: t("Return these minutes?"),
                    description: t("They go back to the writer as a draft with your note."),
                    confirmLabel: t("Return"),
                    note: { label: t("What should change?"), required: true },
                  })
                  if (answer.confirmed) act(() => returnMinutes(m.id, answer.note), t("Returned with your note"))
                }}
              >
                <Undo2 className="mr-1.5 h-4 w-4" />
                {t("Return")}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const answer = await confirm({
                    title: t("Approve these minutes?"),
                    description: t("They become the official record: locked, numbered and shared with every member."),
                    confirmLabel: t("Approve"),
                  })
                  if (answer.confirmed) act(() => approveMinutes(m.id), t("Minutes approved"))
                }}
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                {t("Approve")}
              </Button>
            </>
          )}
          {m.can_sign && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const answer = await confirm({
                    title: t("Decline to sign?"),
                    description: t(
                      "Say what is wrong. The Secretary and the President are told; you can still sign later.",
                    ),
                    confirmLabel: t("Decline"),
                    destructive: true,
                    note: { label: t("What is wrong with the minutes?"), required: true },
                  })
                  if (answer.confirmed) act(() => declineMinutes(m.id, answer.note), t("Recorded that you declined"))
                }}
              >
                {t("Decline")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setSigning(true)}>
                <PenLine className="mr-1.5 h-4 w-4" />
                {t("Sign the minutes")}
              </Button>
            </>
          )}
          {m.has_pdf && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadMinutesPdf(m).catch(() => toast.error(t("Download failed.")))}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {t("PDF")}
            </Button>
          )}
        </div>
      </div>

      {m.return_note && m.status === "draft" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t("Returned by {0}: {1}", m.reviewed_by_name ?? "", m.return_note)}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} />
            {m.reference && <span className="font-nums text-xs text-muted-foreground">{m.reference}</span>}
          </div>
          <CardTitle className="text-lg">{m.title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {formatDate(m.held_at)}, {formatTime(m.held_at)}
            </span>
            <span className="flex items-center gap-1">
              {m.meeting_type === "online" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {m.meeting_type === "online" ? t("Online") : t("In person")}
              {m.location ? ` · ${m.location}` : ""}
            </span>
            <span>{t("Chaired by {0}", m.chaired_by)}</span>
            <span>{t("Recorded by {0}", m.recorded_by_name)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section>
            <h4 className="mb-2 text-sm font-semibold">
              {t("Attendance")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("{0} of {1} members present", present, m.members_total)}
              </span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {m.attendees.map((a) => (
                <Badge key={a.id} variant="secondary" className="font-normal">
                  {a.name}
                </Badge>
              ))}
            </div>
            {m.guests && <p className="mt-2 text-xs text-muted-foreground">{t("Also present: {0}", m.guests)}</p>}
          </section>

          {m.signatures.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold">
                {t("Signatures")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("{0} of {1} signed", m.signed_count, m.signatures.length)}
                </span>
              </h4>
              <ul className="flex flex-col divide-y rounded-lg border">
                {m.signatures.map((x) => (
                  <li key={x.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">{x.name}</span>
                    {x.status === "signed" ? (
                      <>
                        {x.has_image && <SignatureThumb url={signatureImageUrl(m.id, x.user_id)} />}
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">
                          {t("Signed {0}", formatDateTime(x.signed_at))}
                        </span>
                      </>
                    ) : x.status === "declined" ? (
                      <span className="text-xs text-destructive">{t("Declined: {0}", x.note ?? "")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("Not signed yet")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold">{t("Proceedings")}</h4>
            {m.agenda.map((item, i) => (
              <div key={i} className="rounded-lg border p-4">
                <p className="mb-2 font-medium">
                  {n(i + 1)}. {item.title}
                </p>
                {item.discussion && (
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Discussed")}
                    </p>
                    <p className="whitespace-pre-line text-sm">{item.discussion}</p>
                  </div>
                )}
                {item.decision && (
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Concluded")}
                    </p>
                    <p className="whitespace-pre-line text-sm">{item.decision}</p>
                  </div>
                )}
                {item.vote && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                    <span className="font-medium">{t(CATEGORY_LABEL[item.vote.category] ?? "Other")}</span>
                    <span>
                      {t(
                        "{0} for · {1} against · {2} abstained",
                        item.vote.votes_for,
                        item.vote.votes_against,
                        item.vote.abstained,
                      )}
                    </span>
                    <ResultBadge passed={item.vote.result === "passed"} unanimous={item.vote.unanimous} />
                  </div>
                )}
              </div>
            ))}
          </section>

          {m.other_business && (
            <section>
              <h4 className="mb-1 text-sm font-semibold">{t("Any other business")}</h4>
              <p className="whitespace-pre-line text-sm">{m.other_business}</p>
            </section>
          )}

          {m.status === "approved" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              {t("Approved by {0} on {1}", m.reviewed_by_name ?? "", formatDateTime(m.reviewed_at))}
            </p>
          )}
        </CardContent>
      </Card>
      <SignatureDialog
        open={signing}
        title={t("Sign the minutes")}
        description={t('By signing you confirm these minutes are a true record of "{0}".', m.title)}
        confirmLabel={t("Sign")}
        onCancel={() => setSigning(false)}
        onConfirm={async (image) => {
          try {
            setM(await signMinutes(m.id, image))
            toast.success(t("Thank you, your signature is recorded"))
            setSigning(false)
            return true
          } catch (err) {
            toast.error(apiError(err, t("Couldn't record your signature.")))
            return false
          }
        }}
      />
    </div>
  )
}

export function ResolutionsPanel() {
  const [items, setItems] = useState<Resolution[] | null>(null)
  const [filter, setFilter] = useState<"all" | "passed" | "not_passed">("all")

  useEffect(() => {
    let cancelled = false
    listResolutions()
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (!items) return <Skeleton className="h-48 w-full" />
  const shown = items.filter((r) => filter === "all" || r.result === filter)

  return (
    <Card>
      <CardHeader className="flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold">{t("Resolutions register")}</CardTitle>
          <CardDescription>
            {t("Every bill, policy, investment plan and other decision put to a vote, from approved minutes.")}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-1">
          {(["all", "passed", "not_passed"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setFilter(f)}
            >
              {t(f === "all" ? "All" : f === "passed" ? "Passed" : "Not passed")}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {shown.length === 0 ? (
          <p className="mx-4 rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground sm:mx-0">
            {t("No resolutions yet.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">{t("Date")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("Resolution")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("Type")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("For / against / abstained")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("Result")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("Minutes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r, i) => (
                  <tr key={`${r.minutes_id}-${i}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(r.held_at)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.title}</p>
                      {r.decision && <p className="text-xs text-muted-foreground">{r.decision}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs">{t(CATEGORY_LABEL[r.category] ?? "Other")}</td>
                    <td className="font-nums whitespace-nowrap px-3 py-2 text-right text-xs">
                      {n(r.votes_for)} / {n(r.votes_against)} / {n(r.abstained)}
                      <span className="block text-[10px] text-muted-foreground">{t("{0} present", r.present)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <ResultBadge passed={r.result === "passed"} unanimous={r.unanimous} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.meeting_title}
                      {r.reference && <span className="font-nums block">{r.reference}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
