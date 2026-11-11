import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Loader2, PhoneCall, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/api/api"
import { apiError, formatDateTime, type ProxyRequest } from "./signing"

interface Props {
  /** "bearer": pending requests to authorise. "admin": all requests, can cancel. */
  mode: "bearer" | "admin"
  /** Bump to reload (e.g. after a new proxy request was created). */
  refreshKey?: number
  onChanged?: () => void
}

const statusClass: Record<string, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  applied: "border-success/30 bg-success/10 text-success",
  declined: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
}

export default function ProxyRequestsPanel({ mode, refreshKey, onChanged }: Props) {
  const [requests, setRequests] = useState<ProxyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/policies/proxy-requests", {
        params: mode === "bearer" ? { status: "pending" } : undefined,
      })
      setRequests(res.data as ProxyRequest[])
      setError(null)
    } catch (err) {
      setError(apiError(err, "Could not load proxy requests."))
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const act = async (id: string, call: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await call()
      await load()
      onChanged?.()
    } catch (err) {
      setError(apiError(err, "Action failed."))
    } finally {
      setBusyId(null)
    }
  }

  const authorise = (req: ProxyRequest, approve: boolean) => {
    const note = approve ? null : window.prompt("Why are you declining? (optional)") ?? null
    return act(req.id, () => apiClient.post(`/policies/proxy-requests/${req.id}/authorise`, { approve, note }))
  }

  const cancel = (req: ProxyRequest) => {
    if (!window.confirm(`Cancel the proxy request for ${req.signer_name}?`)) return
    return act(req.id, () => apiClient.post(`/policies/proxy-requests/${req.id}/cancel`))
  }

  // Office bearers only see the panel when something needs them
  if (mode === "bearer" && !loading && requests.length === 0 && !error) return null

  return (
    <Card className={mode === "bearer" ? "border-warning/40" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4" />
          {mode === "bearer" ? "Proxy signatures awaiting authorisation" : "Proxy signature requests"}
        </CardTitle>
        <CardDescription>
          An Admin may sign for an absent member only after consulting them, and only once the President, Treasurer and
          Secretary each authorise it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && requests.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No proxy requests.</p>
        )}
        {requests.map((req) => {
          const approvedBy = req.authorisations.filter((a) => a.approved).map((a) => a.name)
          return (
            <div key={req.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {req.decision === "approved" ? "Approve" : "Reject"} on behalf of {req.signer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {req.policy_label} · requested by Admin {req.requested_by_name} · {formatDateTime(req.created_at)}
                  </p>
                </div>
                <Badge variant="outline" className={`capitalize ${statusClass[req.status] ?? ""}`}>
                  {req.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Consultation:</span> {req.consultation_note}
              </p>
              {req.reason && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Member's reason:</span> {req.reason}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Needs: {req.required_roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(", ")}
                {approvedBy.length > 0 && ` · authorised by ${approvedBy.join(", ")}`}
                {req.authorisations
                  .filter((a) => !a.approved)
                  .map((a) => ` · declined by ${a.name}${a.note ? ` (“${a.note}”)` : ""}`)
                  .join("")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {req.can_authorise && (
                  <>
                    <Button size="sm" disabled={busyId === req.id} onClick={() => authorise(req, true)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Authorise
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === req.id} onClick={() => authorise(req, false)}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Decline
                    </Button>
                  </>
                )}
                {mode === "admin" && req.status === "pending" && (
                  <Button size="sm" variant="ghost" disabled={busyId === req.id} onClick={() => cancel(req)}>
                    Cancel request
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
