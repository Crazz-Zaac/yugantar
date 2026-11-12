import { useState, useEffect, useCallback, useRef } from "react"
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Loader2,
  XCircle,
  ShieldCheck,
  Info,
  ClipboardCheck,
  Gavel,
  BadgeCheck,
  Ban,
  Eye,
  FileDown,
  UserCheck,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiClient } from "@/api/api"
import { useSearch } from "wouter"
import { formatDate, formatDateTime } from "@/lib/datetime"
import { downloadLoanAgreement } from "@/lib/download"
import { GuaranteeRequests } from "./GuaranteeRequests"
import { toast } from "sonner"
import { apiError } from "@/components/policies/signing"
import { LoanCalculator } from "./LoanCalculator"
import { latestPolicy } from "@/lib/loanMath"
import { CommunityFilters } from "@/components/CommunityFilters"
import { communityFilterParams, EMPTY_COMMUNITY_FILTERS, type CommunityFilterValues } from "@/lib/communityFilters"

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoanPolicy {
  policy_id: string
  version: number
  max_loan_amount: string
  min_loan_amount: string
  interest_rate: string
  grace_period_days: number | null
  max_renewals: number | null
  requires_collateral: boolean
  status: string
  emi_applicable: boolean
  effective_from: string
  effective_to: string | null
}

interface LoanItem {
  id: string
  policy_id: string
  user_id: string
  principal_rupees: string
  penalties_rupees: string
  accrued_interest_rupees: string
  total_paid_rupees: string
  interest_rate: string
  status: "pending" | "approved" | "rejected" | "active" | "paid"
  start_date: string
  maturity_date: string
  created_at: string
  updated_at: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  disbursed_at: string | null
  collateral_details: string | null
  renewal_count: number
  max_renewals: number | null
  applicant_name: string | null
  purpose: string | null
  fund_verified_by: string | null
  fund_verified_at: string | null
  // Set by the backend on the review queue (same rules it enforces)
  guarantor_user_id?: string | null
  guarantor_name?: string | null
  guarantor_status?: "pending" | "signed" | "declined" | null
  guarantor_signed_name?: string | null
  guarantor_signed_at?: string | null
  guarantor_note?: string | null
  has_agreement?: boolean
  viewer_can_verify_funds?: boolean | null
  viewer_can_decide?: boolean | null
  is_own_application?: boolean | null
}


// Helpers

function formatRs(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value
  return `Rs. ${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function GuarantorLine({ loan }: { loan: LoanItem }) {
  const status = loan.guarantor_status
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      <UserCheck className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Guarantor:</span>
      <span className="font-medium">{loan.guarantor_name}</span>
      {status === "pending" && (
        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">Waiting for signature</Badge>
      )}
      {status === "signed" && (
        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
          Signed as “{loan.guarantor_signed_name}”{loan.guarantor_signed_at ? ` · ${formatDateTime(loan.guarantor_signed_at)}` : ""}
        </Badge>
      )}
      {status === "declined" && (
        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
          Declined{loan.guarantor_note ? `: “${loan.guarantor_note}”` : ""}
        </Badge>
      )}
    </span>
  )
}

function StatusBadge({ status }: { status: LoanItem["status"] }) {
  const config: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
    pending: {
      icon: Clock,
      label: "Pending",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-600",
    },
    approved: {
      icon: ShieldCheck,
      label: "Approved",
      className: "border-blue-500/30 bg-blue-500/10 text-blue-600",
    },
    active: {
      icon: CheckCircle2,
      label: "Active",
      className: "border-success/30 bg-success/10 text-success",
    },
    paid: {
      icon: CheckCircle2,
      label: "Paid",
      className: "border-chart-2/30 bg-chart-2/10 text-chart-2",
    },
    rejected: {
      icon: XCircle,
      label: "Rejected",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  }
  const c = config[status] ?? config.pending
  const Icon = c.icon
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LoansTab() {
  const { user } = useAuth()
  const search = useSearch()

  // ── Role checks ──────────────────────────────────────────────────────────
  const normalizedRoles = (user?.cooperative_roles ?? []).map((role) => String(role).toLowerCase())
  const isTreasurer = normalizedRoles.includes("treasurer")
  const isPresident = normalizedRoles.includes("president")
  const isSecretary = normalizedRoles.includes("secretary")
  // Office bearers. The Secretary steps in for the Treasurer's/President's own
  // loans; which buttons appear per loan comes from the backend.
  const isReviewer = isTreasurer || isPresident || isSecretary

  // ── State ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("apply")

  useEffect(() => {
    // wouter's useLocation() is the path only; the query comes from useSearch()
    const params = new URLSearchParams(search)
    const subtab = params.get("subtab")
    if (!subtab) return

    const allowedTabs = isReviewer
      ? ["apply", "my-loans", "community", "history", "review"]
      : ["apply", "my-loans", "community", "history"]

    if (allowedTabs.includes(subtab)) {
      setActiveTab(subtab)
    }
  }, [search, isReviewer])

  // Policies
  const [policies, setPolicies] = useState<LoanPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<LoanPolicy | null>(null)
  const [policiesLoading, setPoliciesLoading] = useState(false)

  // Application form
  const [applyAmount, setApplyAmount] = useState("")
  const [applyTerm, setApplyTerm] = useState("")
  const [applyPurpose, setApplyPurpose] = useState("")
  const [applyCollateral, setApplyCollateral] = useState("")
  const [applyNotes, setApplyNotes] = useState("")
  const [applyLoading, setApplyLoading] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  // Guarantor: any other active member (required when the policy requires collateral)
  const [members, setMembers] = useState<{ id: string; name: string; roles: string[] }[]>([])
  const [guarantorId, setGuarantorId] = useState("")
  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/users/directory")
      .then((r) => !cancelled && setMembers(r.data))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const isOfficeBearer = isReviewer

  // The application form, so "Apply with these numbers" can scroll to it
  const applyFormRef = useRef<HTMLDivElement>(null)

  // My loans
  const [myLoans, setMyLoans] = useState<LoanItem[]>([])
  const [myLoansLoading, setMyLoansLoading] = useState(false)

  // Community
  const [communityLoans, setCommunityLoans] = useState<LoanItem[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)

  // Review tab (treasurer / president)
  const [pendingLoans, setPendingLoans] = useState<LoanItem[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [rejectDialogLoan, setRejectDialogLoan] = useState<LoanItem | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchPolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      const res = await apiClient.get("/policies/loan")
      const active = (res.data as LoanPolicy[]).filter((p) => p.status === "active")
      setPolicies(active)
      if (active.length > 0) setSelectedPolicy(latestPolicy(active) ?? active[0])
    } catch {
      /* silent */
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  const fetchMyLoans = useCallback(async () => {
    setMyLoansLoading(true)
    try {
      const res = await apiClient.get("/loans/me")
      setMyLoans(res.data.loans ?? [])
    } catch {
      /* silent */
    } finally {
      setMyLoansLoading(false)
    }
  }, [])

  const [communityFilters, setCommunityFilters] = useState<CommunityFilterValues>(EMPTY_COMMUNITY_FILTERS)
  const fetchCommunityLoans = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const res = await apiClient.get("/loans/community", {
        params: { limit: 100, ...communityFilterParams(communityFilters, { choice: "status", text: "purpose" }) },
      })
      setCommunityLoans(res.data.loans ?? [])
    } catch {
      /* silent */
    } finally {
      setCommunityLoading(false)
    }
  }, [communityFilters])

  // Re-query when filters change (debounced for typing)
  useEffect(() => {
    if (activeTab !== "community") return
    const timer = setTimeout(fetchCommunityLoans, 300)
    return () => clearTimeout(timer)
  }, [communityFilters, activeTab, fetchCommunityLoans])

  const fetchPendingLoans = useCallback(async () => {
    if (!isReviewer) return
    setPendingLoading(true)
    try {
      const res = await apiClient.get("/loans/pending")
      setPendingLoans(res.data.loans ?? [])
    } catch {
      /* silent */
    } finally {
      setPendingLoading(false)
    }
  }, [isReviewer])

  useEffect(() => {
    fetchPolicies()
  }, [fetchPolicies])

  useEffect(() => {
    if (activeTab === "my-loans" || activeTab === "history") fetchMyLoans()
    // "community" loads via the debounced filter effect
    if (activeTab === "review") fetchPendingLoans()
  }, [activeTab, fetchMyLoans, fetchPendingLoans])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleApply = async () => {
    if (!selectedPolicy || !applyAmount || !applyTerm || !applyPurpose) {
      setApplyError("Please fill all required fields.")
      return
    }
    if (selectedPolicy.requires_collateral && !guarantorId) {
      setApplyError("This policy needs a guarantor: choose a member who will stand surety.")
      return
    }
    setApplyLoading(true)
    setApplyError(null)
    setApplySuccess(false)
    try {
      await apiClient.post("/loans/apply", {
        policy_id: selectedPolicy.policy_id,
        amount_rupees: Number(applyAmount),
        term_months: Number(applyTerm),
        purpose: applyPurpose,
        collateral_details: applyCollateral || null,
        notes: applyNotes || null,
        guarantor_user_id: guarantorId || null,
      })
      setApplySuccess(true)
      setApplyAmount("")
      setApplyTerm("")
      setApplyPurpose("")
      setApplyCollateral("")
      setApplyNotes("")
      setGuarantorId("")
    } catch (err: any) {
      setApplyError(err?.response?.data?.detail ?? "Failed to submit application.")
    } finally {
      setApplyLoading(false)
    }
  }

  // Calculator -> application form
  const handleUseCalculator = (policyId: string, amount: number, months: number) => {
    const p = policies.find((x) => x.policy_id === policyId)
    if (p) setSelectedPolicy(p)
    setApplyAmount(String(amount))
    setApplyTerm(String(months))
    setApplySuccess(false)
    applyFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    toast.success("Amount and term filled in", { description: "Choose a purpose to finish your application." })
  }

  // ── Review action handlers ──────────────────────────────────────────────

  const handleVerifyFunds = async (loanId: string) => {
    setActionLoadingId(loanId)
    try {
      await apiClient.post(`/loans/${loanId}/verify-funds`, {})
      toast.success("Funds verified", { description: "The President has been asked to approve the loan." })
      fetchPendingLoans()
    } catch (err: unknown) {
      toast.error(apiError(err, "Failed to verify funds."))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleApproveLoan = async (loanId: string) => {
    setActionLoadingId(loanId)
    try {
      await apiClient.post(`/loans/${loanId}/approve`, {})
      toast.success("Loan approved", { description: "The applicant has been notified." })
      fetchPendingLoans()
    } catch (err: unknown) {
      toast.error(apiError(err, "Failed to approve loan."))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleRejectLoan = async () => {
    if (!rejectDialogLoan || !rejectReason.trim()) return
    setRejectLoading(true)
    try {
      await apiClient.post(`/loans/${rejectDialogLoan.id}/reject`, {
        rejection_reason: rejectReason.trim(),
      })
      setRejectDialogLoan(null)
      setRejectReason("")
      toast.success("Loan rejected", { description: "The applicant has been told the reason." })
      fetchPendingLoans()
    } catch (err: unknown) {
      toast.error(apiError(err, "Failed to reject loan."))
    } finally {
      setRejectLoading(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const activeLoans = myLoans.filter((l) => ["pending", "approved", "active"].includes(l.status))
  const historyLoans = myLoans.filter((l) => ["paid", "rejected"].includes(l.status))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Loans</h2>
        <p className="text-sm text-muted-foreground">
          Apply for loans, track your applications, and view community activity
        </p>
      </div>

      <GuaranteeRequests onChanged={fetchMyLoans} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`h-auto w-full justify-start overflow-x-auto [scrollbar-width:none] [&>button]:shrink-0 sm:grid ${isReviewer ? "sm:max-w-2xl sm:grid-cols-5" : "sm:max-w-xl sm:grid-cols-4"}`}>
          <TabsTrigger value="apply">Apply for Loan</TabsTrigger>
          <TabsTrigger value="my-loans">My Loans</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          {isReviewer && (
            <TabsTrigger value="review" className="gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Review
            </TabsTrigger>
          )}
        </TabsList>

        {/* ──────────────────── APPLY TAB ──────────────────── */}
        <TabsContent value="apply" className="mt-4 flex flex-col gap-6">
          {policies.length > 0 && (
            <>
              {/* One policy choice, shared by the calculator and the application form */}
              <section className="flex flex-col gap-2" aria-label="Loan policy">
                <h3 className="text-sm font-semibold">1. Choose a loan policy</h3>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                  {[...policies]
                    .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                    .map((p) => {
                      const active = selectedPolicy?.policy_id === p.policy_id
                      return (
                        <button
                          key={p.policy_id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setSelectedPolicy(p)}
                          className={`flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors ${
                            active ? "border-primary ring-1 ring-primary" : "hover:bg-muted/50"
                          }`}
                        >
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-primary" : ""}`}>
                            {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                              {formatRs(p.min_loan_amount)} – {formatRs(p.max_loan_amount)}
                              {p.policy_id === latestPolicy(policies)?.policy_id && (
                                <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">Latest</span>
                              )}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {Number(p.interest_rate)}% per year · {p.grace_period_days ?? 0} days' grace ·{" "}
                              {p.requires_collateral ? "collateral required" : "no collateral"}
                              {p.emi_applicable ? " · EMI available" : ""}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              </section>
              {selectedPolicy && (
                <LoanCalculator key={selectedPolicy.policy_id} policy={selectedPolicy} onApply={handleUseCalculator} />
              )}
            </>
          )}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left: Application Form */}
            <div ref={applyFormRef} className="lg:col-span-3 flex scroll-mt-4 flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="h-4 w-4" />
                    Loan Application
                  </CardTitle>
                  <CardDescription>
                    Fill in the details below to apply. Approval goes through Treasurer verification → President approval.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* Policy selector */}
                  {policiesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading policies…
                    </div>
                  ) : policies.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                      <AlertTriangle className="mr-1 inline h-4 w-4" />
                      No active loan policy found. Contact your Treasurer.
                    </div>
                  ) : (
                    <>
                      {selectedPolicy && (
                        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          Applying under the policy chosen above:{" "}
                          <span className="font-medium text-foreground">
                            {formatRs(selectedPolicy.min_loan_amount)} – {formatRs(selectedPolicy.max_loan_amount)} at{" "}
                            {Number(selectedPolicy.interest_rate)}% per year
                          </span>
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="loan-amount" className="text-xs font-medium">
                            Loan Amount (Rs.)
                          </Label>
                          <Input
                            id="loan-amount"
                            type="number"
                            placeholder={selectedPolicy ? `${Number(selectedPolicy.min_loan_amount)} – ${Number(selectedPolicy.max_loan_amount)}` : "0"}
                            value={applyAmount}
                            onChange={(e) => setApplyAmount(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="loan-term" className="text-xs font-medium">
                            Term
                          </Label>
                          <Select value={applyTerm} onValueChange={setApplyTerm}>
                            <SelectTrigger id="loan-term">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...new Set([3, 6, 12, 18, 24, 36, 48, 60, ...(applyTerm ? [Number(applyTerm)] : [])])].sort((a, b) => a - b).map((m) => (
                                <SelectItem key={m} value={String(m)}>
                                  {m} months
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="loan-purpose" className="text-xs font-medium">
                          Purpose
                        </Label>
                        <Select value={applyPurpose} onValueChange={setApplyPurpose}>
                          <SelectTrigger id="loan-purpose">
                            <SelectValue placeholder="Select purpose" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Business Expansion">Business Expansion</SelectItem>
                            <SelectItem value="Agriculture">Agriculture</SelectItem>
                            <SelectItem value="Housing">Housing</SelectItem>
                            <SelectItem value="Education">Education</SelectItem>
                            <SelectItem value="Medical">Medical</SelectItem>
                            <SelectItem value="Emergency">Emergency</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="guarantor" className="text-xs font-medium">
                          Guarantor{" "}
                          {selectedPolicy?.requires_collateral ? (
                            <span className="text-destructive">*</span>
                          ) : (
                            <span className="font-normal text-muted-foreground">(optional)</span>
                          )}
                        </Label>
                        <Select value={guarantorId || "none"} onValueChange={(v) => setGuarantorId(v === "none" ? "" : v)}>
                          <SelectTrigger id="guarantor">
                            <SelectValue placeholder="Choose a member" />
                          </SelectTrigger>
                          <SelectContent>
                            {!selectedPolicy?.requires_collateral && <SelectItem value="none">No guarantor</SelectItem>}
                            {members
                              .filter((m) => m.id !== user?.id)
                              .map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                  {m.roles.filter((r) => r !== "member").length > 0 &&
                                    ` · ${m.roles.filter((r) => r !== "member").map((r) => r[0].toUpperCase() + r.slice(1)).join(", ")}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          A registered member who stands surety for your loan. They must sign (with their name and the date) before the Treasurer reviews your application.
                        </p>
                      </div>
                      {selectedPolicy?.requires_collateral && (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="collateral" className="text-xs font-medium">
                            Collateral notes <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Textarea
                            id="collateral"
                            placeholder="Anything else you're offering as security…"
                            value={applyCollateral}
                            onChange={(e) => setApplyCollateral(e.target.value)}
                            rows={2}
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="notes" className="text-xs font-medium">
                          Notes (optional)
                        </Label>
                        <Textarea
                          id="notes"
                          placeholder="Any additional information…"
                          value={applyNotes}
                          onChange={(e) => setApplyNotes(e.target.value)}
                          rows={2}
                        />
                      </div>

                      {applyError && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {applyError}
                        </div>
                      )}

                      {applySuccess && (
                        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                          <CheckCircle2 className="mr-1 inline h-4 w-4" />
                          Application submitted! If you chose a guarantor, they sign first; then the Treasurer verifies funds and the President decides.
                        </div>
                      )}

                      <Button onClick={handleApply} disabled={applyLoading || !selectedPolicy}>
                        {applyLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Submit Application
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Active Policy Info + Calculator */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Policy card */}
              {selectedPolicy && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Info className="h-4 w-4" />
                      Active Policy Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                      <span className="text-muted-foreground">Min Amount</span>
                      <span className="font-medium text-right">{formatRs(selectedPolicy.min_loan_amount)}</span>
                      <span className="text-muted-foreground">Max Amount</span>
                      <span className="font-medium text-right">{formatRs(selectedPolicy.max_loan_amount)}</span>
                      <span className="text-muted-foreground">Interest Rate</span>
                      <span className="font-medium text-right">{Number(selectedPolicy.interest_rate)}% p.a.</span>
                      <span className="text-muted-foreground">Grace Period</span>
                      <span className="font-medium text-right">{selectedPolicy.grace_period_days ?? 0} days</span>
                      <span className="text-muted-foreground">Max Renewals</span>
                      <span className="font-medium text-right">{selectedPolicy.max_renewals ?? "N/A"}</span>
                      <span className="text-muted-foreground">Collateral Required</span>
                      <span className="font-medium text-right">{selectedPolicy.requires_collateral ? "Yes" : "No"}</span>
                      <span className="text-muted-foreground">EMI Applicable</span>
                      <span className="font-medium text-right">{selectedPolicy.emi_applicable ? "Yes" : "No"}</span>
                      <span className="text-muted-foreground">Effective From</span>
                      <span className="font-medium text-right">{formatDate(selectedPolicy.effective_from)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ──────────────────── MY LOANS TAB ──────────────────── */}
        <TabsContent value="my-loans" className="mt-4 flex flex-col gap-6">
          {myLoansLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your loans…
            </div>
          ) : activeLoans.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p>No active or pending loans</p>
                <p className="text-xs">Apply for a loan from the "Apply for Loan" tab</p>
              </CardContent>
            </Card>
          ) : (
            activeLoans.map((loan) => (
              <Card key={loan.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {loan.purpose ?? "Loan"} – {formatRs(loan.principal_rupees)}
                      </CardTitle>
                      <CardDescription>Applied {formatDate(loan.created_at)}</CardDescription>
                    </div>
                    <StatusBadge status={loan.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Principal</p>
                      <p className="font-nums mt-1 text-lg font-bold">{formatRs(loan.principal_rupees)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Interest Rate</p>
                      <p className="font-nums mt-1 text-lg font-bold">{Number(loan.interest_rate)}% p.a.</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Paid</p>
                      <p className="font-nums mt-1 text-lg font-bold">{formatRs(loan.total_paid_rupees)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Accrued Interest</p>
                      <p className="font-nums mt-1 text-lg font-bold">{formatRs(loan.accrued_interest_rupees)}</p>
                    </div>
                  </div>

                  {/* Repayment progress for active loans */}
                  {loan.status === "active" && Number(loan.principal_rupees) > 0 && (
                    <div className="mt-5">
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-muted-foreground">Repayment Progress</span>
                        <span className="font-nums font-medium">
                          {formatRs(loan.total_paid_rupees)} / {formatRs(loan.principal_rupees)}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(
                          (Number(loan.total_paid_rupees) / Number(loan.principal_rupees)) * 100,
                          100
                        )}
                        className="h-2.5"
                      />
                    </div>
                  )}

                  {/* Guarantor + agreement */}
                  {(loan.guarantor_name || loan.has_agreement) && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                      {loan.guarantor_name ? <GuarantorLine loan={loan} /> : <span />}
                      {loan.has_agreement && (
                        <Button size="sm" variant="outline" onClick={() => downloadLoanAgreement(loan.id).catch(() => toast.error("Couldn't download the agreement."))}>
                          <FileDown className="mr-2 h-4 w-4" /> Loan agreement (PDF)
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Rejection reason */}
                  {loan.status === "rejected" && loan.rejection_reason && (
                    <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                      <strong>Rejection reason:</strong> {loan.rejection_reason}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>Start: {formatDate(loan.start_date)}</span>
                    <span>Maturity: {formatDate(loan.maturity_date)}</span>
                    {loan.disbursed_at && <span>Disbursed: {formatDate(loan.disbursed_at)}</span>}
                    {loan.approved_by && <span>Approved by: {loan.approved_by}</span>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ──────────────────── COMMUNITY TAB ──────────────────── */}
        <TabsContent value="community" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Community Loans</CardTitle>
              <CardDescription>Lending activity across the cooperative</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <CommunityFilters
                values={communityFilters}
                onChange={setCommunityFilters}
                choice={{
                  label: "Status",
                  options: [
                    { value: "approved", label: "Approved" },
                    { value: "active", label: "Active" },
                    { value: "paid", label: "Paid" },
                  ],
                }}
                text={{ label: "Purpose", placeholder: "e.g. school" }}
                resultCount={communityLoading ? undefined : communityLoans.length}
              />
              {communityLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : communityLoans.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {Object.values(communityFilters).some(Boolean) ? "No loans match these filters." : "No community loans yet."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Member</TableHead>
                        <TableHead className="text-xs">Purpose</TableHead>
                        <TableHead className="text-right text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Maturity</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Guarantor</TableHead>
                        <TableHead className="text-xs"><span className="sr-only">Agreement</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {communityLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell className="text-sm font-medium">{loan.applicant_name ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{loan.purpose ?? "—"}</TableCell>
                          <TableCell className="font-nums text-right text-sm font-medium">
                            {formatRs(loan.principal_rupees)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(loan.maturity_date)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={loan.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{loan.guarantor_name ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {loan.has_agreement &&
                              (isOfficeBearer || loan.user_id === user?.id || loan.guarantor_user_id === user?.id) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  title="Download the loan agreement (PDF)"
                                  onClick={() => downloadLoanAgreement(loan.id).catch(() => toast.error("Couldn't download the agreement."))}
                                >
                                  <FileDown className="h-4 w-4" />
                                  <span className="ml-1.5 hidden sm:inline">PDF</span>
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────────────── HISTORY TAB ──────────────────── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Loan History</CardTitle>
              <CardDescription>Your completed and rejected loans</CardDescription>
            </CardHeader>
            <CardContent>
              {myLoansLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : historyLoans.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No loan history yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Purpose</TableHead>
                        <TableHead className="text-right text-xs">Principal</TableHead>
                        <TableHead className="text-right text-xs">Total Paid</TableHead>
                        <TableHead className="text-xs">Applied</TableHead>
                        <TableHead className="text-xs">Maturity</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell className="text-sm">{loan.purpose ?? "—"}</TableCell>
                          <TableCell className="font-nums text-right text-sm font-medium">
                            {formatRs(loan.principal_rupees)}
                          </TableCell>
                          <TableCell className="font-nums text-right text-sm font-medium">
                            {formatRs(loan.total_paid_rupees)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(loan.created_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(loan.maturity_date)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={loan.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ──────────────────── REVIEW TAB (Treasurer / President) ──────────────────── */}
        {isReviewer && (
          <TabsContent value="review" className="mt-4 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardCheck className="h-4 w-4" />
                  Pending Loan Applications
                </CardTitle>
                <CardDescription>
                  The Treasurer verifies funds, then the President approves or rejects. Nobody handles their own
                  application, and the same person can't do both steps; the Secretary steps in when needed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading applications…
                  </div>
                ) : pendingLoans.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p>No pending loan applications</p>
                    <p className="text-xs">All caught up!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {pendingLoans.map((loan) => {
                      const isExpanded = expandedLoanId === loan.id
                      const isVerified = !!loan.fund_verified_by
                      const isThisLoading = actionLoadingId === loan.id

                      return (
                        <Card key={loan.id} className="border">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-sm font-semibold">
                                  {loan.applicant_name ?? "Unknown"} — {loan.purpose ?? "Loan"}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-3">
                                  <span>{formatRs(loan.principal_rupees)}</span>
                                  <span>•</span>
                                  <span>{Number(loan.interest_rate)}% p.a.</span>
                                  <span>•</span>
                                  <span>Applied {formatDate(loan.created_at)}</span>
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                {isVerified ? (
                                  <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-600 text-xs">
                                    <BadgeCheck className="h-3 w-3" />
                                    Funds Verified
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 text-xs">
                                    <Clock className="h-3 w-3" />
                                    Awaiting Verification
                                  </Badge>
                                )}

                                {/* Verify Funds: Treasurer (Secretary for the Treasurer's own loan) */}
                                {loan.viewer_can_verify_funds && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleVerifyFunds(loan.id)}
                                    disabled={isThisLoading}
                                  >
                                    {isThisLoading ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <BadgeCheck className="mr-2 h-4 w-4" />
                                    )}
                                    Verify Funds
                                  </Button>
                                )}

                                {/* Approve / Reject: President (Secretary for the President's own loan) */}
                                {loan.viewer_can_decide && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveLoan(loan.id)}
                                      disabled={isThisLoading}
                                      className="bg-success text-white hover:bg-success/90"
                                    >
                                      {isThisLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Gavel className="mr-2 h-4 w-4" />
                                      )}
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setRejectDialogLoan(loan)
                                        setRejectReason("")
                                      }}
                                      disabled={isThisLoading}
                                    >
                                      <Ban className="mr-2 h-4 w-4" />
                                      Reject
                                    </Button>
                                  </>
                                )}

                                {/* Nothing for this viewer to do: say why */}
                                {!loan.viewer_can_verify_funds && !loan.viewer_can_decide && (
                                  <span className="text-xs text-muted-foreground italic">
                                    {loan.is_own_application
                                      ? "Your own application: another office bearer handles it"
                                      : loan.guarantor_status === "pending"
                                        ? "Waiting for the guarantor to sign"
                                        : loan.guarantor_user_id === user?.id
                                          ? "You are the guarantor: another office bearer handles it"
                                      : isVerified
                                        ? "Awaiting approval"
                                        : "Awaiting fund verification"}
                                  </span>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>

                          {/* Expandable details */}
                          {isExpanded && (
                            <CardContent className="pt-0">
                              <Separator className="mb-4" />
                              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                                <div>
                                  <p className="text-xs text-muted-foreground">Principal</p>
                                  <p className="font-nums font-medium">{formatRs(loan.principal_rupees)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Interest Rate</p>
                                  <p className="font-nums font-medium">{Number(loan.interest_rate)}% p.a.</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Maturity Date</p>
                                  <p className="font-medium">{formatDate(loan.maturity_date)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Start Date</p>
                                  <p className="font-medium">{formatDate(loan.start_date)}</p>
                                </div>
                                {loan.guarantor_name && (
                                  <div className="col-span-2 sm:col-span-3">
                                    <p className="text-xs text-muted-foreground">Guarantor</p>
                                    <GuarantorLine loan={loan} />
                                  </div>
                                )}
                                {loan.collateral_details && (
                                  <div className="col-span-2">
                                    <p className="text-xs text-muted-foreground">Collateral</p>
                                    <p className="font-medium">{loan.collateral_details}</p>
                                  </div>
                                )}
                                {isVerified && (
                                  <div className="col-span-2 sm:col-span-3">
                                    <p className="text-xs text-muted-foreground">Funds Verified By</p>
                                    <p className="font-medium">
                                      {loan.fund_verified_by} on {formatDate(loan.fund_verified_at)}
                                    </p>
                                  </div>
                                )}
                              </div>


                            </CardContent>
                          )}
                        </Card>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ──────────── Rejection Reason Dialog ──────────── */}
      <Dialog
        open={!!rejectDialogLoan}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialogLoan(null)
            setRejectReason("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Loan Application</DialogTitle>
            <DialogDescription>
              Rejecting {rejectDialogLoan?.applicant_name}'s loan of{" "}
              {rejectDialogLoan ? formatRs(rejectDialogLoan.principal_rupees) : ""}.
              Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogLoan(null)
                setRejectReason("")
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectLoan}
              disabled={rejectLoading || !rejectReason.trim()}
            >
              {rejectLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              Reject Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
