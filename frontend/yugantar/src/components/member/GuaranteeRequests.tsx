import { useEffect, useState } from "react"
import { Handshake, Loader2, PenLine, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/api/api"
import { useAuth } from "@/contexts/AuthContext"
import { useConfirm } from "@/components/confirm/confirmContext"
import { apiError } from "@/components/policies/signing"
import { formatDate, formatDateTime } from "@/lib/datetime"
import { formatRs } from "@/lib/money"

interface GuaranteeLoan {
  id: string
  applicant_name: string | null
  principal_rupees: string | number
  interest_rate: string | number
  purpose: string | null
  start_date: string
  maturity_date: string
  created_at: string
}

/** Loans that ask the signed-in member to stand guarantor. Shows nothing if none. */
export function GuaranteeRequests({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [requests, setRequests] = useState<GuaranteeLoan[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/loans/guarantee-requests")
      .then((r) => !cancelled && setRequests(r.data as GuaranteeLoan[]))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  if (requests.length === 0) return null
  const myName = user ? `${user.first_name} ${user.last_name}`.trim() : "you"

  const respond = async (loan: GuaranteeLoan, accept: boolean) => {
    const amount = formatRs(loan.principal_rupees)
    const answer = await confirm(
      accept
        ? {
            title: `Sign as guarantor for ${loan.applicant_name ?? "this member"}?`,
            description: `You agree to stand surety for their loan of ${amount}. Your signature is recorded as "${myName}" on ${formatDateTime(new Date().toISOString())} and appears on the loan agreement.`,
            confirmLabel: "Sign as guarantor",
          }
        : {
            title: "Decline to be guarantor?",
            description: "The application will be closed and the member told. They can apply again with someone else.",
            confirmLabel: "Decline",
            destructive: true,
            note: { label: "Reason (optional, shared with the member)", placeholder: "e.g. I can't commit this year" },
          },
    )
    if (!answer.confirmed) return
    setBusyId(loan.id)
    try {
      await apiClient.post(`/loans/${loan.id}/guarantee`, { accept, note: accept ? null : answer.note || null })
      toast.success(accept ? "You signed as guarantor" : "You declined", {
        description: accept ? "The application now goes to the Treasurer." : "The member has been told.",
      })
      setReloadKey((k) => k + 1)
      onChanged?.()
    } catch (err) {
      toast.error(apiError(err, "Couldn't record your answer."))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/[0.06] to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Handshake className="h-4 w-4 text-primary" />
          {requests.length > 1 ? "Requests" : "A request"} to be a guarantor
        </CardTitle>
        <CardDescription>
          A member chose you as guarantor. The loan only goes to the Treasurer once you sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {requests.map((loan) => (
          <div key={loan.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {loan.applicant_name ?? "A member"} · <span className="font-nums">{formatRs(loan.principal_rupees)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {loan.purpose ?? "Loan"} · {Number(loan.interest_rate)}% per year · until {formatDate(loan.maturity_date)} · asked{" "}
                {formatDate(loan.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busyId === loan.id} onClick={() => respond(loan, false)}>
                <XCircle className="mr-2 h-4 w-4" /> Decline
              </Button>
              <Button size="sm" disabled={busyId === loan.id} onClick={() => respond(loan, true)}>
                {busyId === loan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                Sign as guarantor
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
