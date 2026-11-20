import { enumLabel, n, t } from "@/lib/i18n"
import { useState, useEffect, useRef, useCallback } from "react"
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  Landmark,
  Loader2,
  AlertCircle,
  ScanLine,
  CalendarClock,
  IndianRupee,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Receipt,
  Plus,
  Pencil,
  ShieldCheck,
  Clock,
  Users,
  History,
  ListChecks,
  BadgeCheck,
  Ban,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient } from "@/api/api"
import ReceiptReviewDialog from "./ReceiptReviewDialog"
import { useSearch } from "wouter"
import { formatDate, formatDateBoth, formatDateTime } from "@/lib/datetime"
import { CommunityFilters } from "@/components/CommunityFilters"
import { communityFilterParams, EMPTY_COMMUNITY_FILTERS, type CommunityFilterValues } from "@/lib/communityFilters"

type PolicyStatus = "draft" | "finalized" | "active" | "expired" | "void"
type DepositScheduleType = "monthly_fixed_day" | "occasional"
type SplitCategory = "deposit" | "fine" | "advance" | "loan_principal" | "loan_interest" | "loan_renewal" | "service_charge"
const LOAN_CATEGORIES: SplitCategory[] = ["loan_principal", "loan_interest", "loan_renewal", "service_charge"]

interface DepositPolicy {
  policy_id: string
  amount_paisa: number
  late_deposit_fine: number
  schedule_type: DepositScheduleType
  due_day_of_month: number | null
  allowed_months?: number | null
  status: PolicyStatus
  effective_from: string
}

/** "Due on day 10 each month" / "Within 3 months" */
function scheduleText(p: DepositPolicy): string {
  if (p.schedule_type === "monthly_fixed_day") {
    return p.due_day_of_month ? t("Due on day {0} each month", p.due_day_of_month) : t("Monthly (due day not set)")
  }
  return p.allowed_months ? (p.allowed_months === 1 ? t("Within {0} month", 1) : t("Within {0} months", p.allowed_months)) : t("Occasional (period not set)")
}

interface OcrResult {
  amount: number | null
  charge: number | null
  date: string | null
  reference: string | null
}

const EMPTY_OCR_RESULT: OcrResult = { amount: null, charge: null, date: null, reference: null }

// The worker omits fields it couldn't read; normalise them to null.
function normalizeOcrResult(raw: Partial<OcrResult> | null | undefined): OcrResult {
  return {
    amount: typeof raw?.amount === "number" ? raw.amount : null,
    charge: typeof raw?.charge === "number" ? raw.charge : null,
    date: raw?.date ?? null,
    reference: raw?.reference ?? null,
  }
}

// A voucher needs a positive amount and a reference. The deposit date/time is
// taken from the system clock at submission, not from the voucher.
function voucherIsComplete(v: OcrResult): boolean {
  return v.amount != null && v.amount > 0 && !!v.reference?.trim()
}

interface LoanSummary {
  loan_id: string
  principal_paisa: number
  accrued_interest_paisa: number
  total_paid_paisa: number
  outstanding_principal_paisa: number
  outstanding_interest_paisa: number
  interest_rate: number
  service_charge_due_paisa: number // still to pay with a deposit
}

interface SplitAllocation {
  category: SplitCategory
  label: string
  amount_rupees: number
  loan_id: string | null
}

interface PreviewResponse {
  ocr_amount: number
  ocr_charge: number
  net_amount: number
  required_deposit: number
  due_date: string
  is_late: boolean
  fine_amount: number
  fine_percentage: number
  excess_amount: number
  is_insufficient: boolean
  active_loans: LoanSummary[]
}

interface DepositItem {
  id: string
  user_id: string
  deposited_amount: string | number
  deposit_type: "current" | "advance"
  deposited_date: string
  due_deposit_date: string
  verification_status: "pending" | "verified" | "rejected"
  verified_by: string | null
  receipt_id: string | null
  depositor_name?: string | null
  created_at: string
}

function formatRs(paisa: number): string {
  const rupees = Math.round(Number(paisa) / 100)
  return `Rs. ${rupees.toLocaleString("en-IN")}`
}

function formatRsFromRupees(rupees: number): string {
  return `Rs. ${Number(rupees || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function depositStatusBadge(status: DepositItem["verification_status"]) {
  if (status === "verified") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
        <CheckCircle2 className="h-3 w-3" />
        {t("Verified")}</Badge>
    )
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs">
        <AlertCircle className="h-3 w-3" />
        {t("Rejected")}</Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 text-xs">
      <Clock className="h-3 w-3" />
      {t("Pending")}</Badge>
  )
}

function categoryLabel(category: SplitCategory): string {
  const map: Record<SplitCategory, string> = {
    deposit: "Regular Deposit",
    fine: "Late Deposit Fine",
    advance: "Advance Deposit",
    loan_principal: "Loan Principal",
    loan_interest: "Loan Interest",
    loan_renewal: "Loan Renewal",
    service_charge: "Service Charge",
  }
  return t(map[category])
}

// The OCR itself runs in well under a second, so poll briskly rather than
// making the member wait out a slow tick. Give up after OCR_POLL_TIMEOUT_MS
// (e.g. the worker is down or overwhelmed) and fall back to manual entry
// instead of spinning forever.
const OCR_POLL_INTERVAL = 500
const OCR_POLL_TIMEOUT_MS = 45_000

// Build the default split from what the preview already computed: cover the
// late fine first, then the regular deposit, and park any leftover as an
// advance. Loans are never auto-paid — repaying a loan stays a deliberate
// choice the member makes via "Add category".
function buildDefaultAllocations(p: PreviewResponse): SplitAllocation[] {
  const rows: SplitAllocation[] = []
  let remaining = p.net_amount
  const take = (category: SplitCategory, want: number) => {
    const amt = Math.min(Math.max(want, 0), remaining)
    if (amt <= 0) return
    rows.push({ category, label: categoryLabel(category), amount_rupees: amt, loan_id: null })
    remaining = Math.round((remaining - amt) * 100) / 100
  }
  take("fine", p.fine_amount)
  take("deposit", p.required_deposit)
  if (remaining > 0) take("advance", remaining)
  return rows
}

export function DepositTab() {
  const { user } = useAuth()
  const search = useSearch()
  const normalizedRoles = (user?.cooperative_roles ?? []).map((role) =>
    String(role).toLowerCase()
  )
  // Deposit reviewers: the Treasurer, and the Secretary for the Treasurer's own
  // deposits. The backend only returns deposits this user may act on.
  const isDepositReviewer =
    normalizedRoles.includes("treasurer") || normalizedRoles.includes("secretary")
  const isTreasurer = normalizedRoles.includes("treasurer")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  // Set when OCR finishes reading; the next preview load (which renders the
  // Summary) scrolls it into view. We don't scroll on later manual edits that
  // re-run the preview.
  const scrollToSummaryRef = useRef(false)
  const [summaryScrollTick, setSummaryScrollTick] = useState(0)
  useEffect(() => {
    if (summaryScrollTick === 0) return
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [summaryScrollTick])

  const [activeTab, setActiveTab] = useState("make")

  useEffect(() => {
    // wouter's useLocation() is the path only; the query comes from useSearch()
    const params = new URLSearchParams(search)
    const subtab = params.get("subtab")
    if (!subtab) return

    const allowedTabs = isDepositReviewer
      ? ["make", "my", "community", "history", "review"]
      : ["make", "my", "community", "history"]

    if (allowedTabs.includes(subtab)) {
      setActiveTab(subtab)
    }
  }, [search, isDepositReviewer])

  const [activePolicies, setActivePolicies] = useState<DepositPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("")

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [ocrLoading, setOcrLoading] = useState(false)
  // ocrResult holds the (user-editable) voucher values; ocrDetected keeps what
  // OCR originally read so edits can be highlighted. null = manual entry.
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrDetected, setOcrDetected] = useState<OcrResult | null>(null)
  // Stored voucher image (kept 15 days for treasurer review)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [editingDepositId, setEditingDepositId] = useState<string | null>(null)
  // When loading a pending deposit to edit, keep the loaded split instead of
  // letting the next preview fetch re-default the allocations.
  const preserveAllocationsRef = useRef(false)
  const [reviewReceiptId, setReviewReceiptId] = useState<string | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [allocations, setAllocations] = useState<SplitAllocation[]>([])

  const [submitting, setSubmitting] = useState(false)
  // This period's deposit: is it due, and has it been paid? (same source as Home)
  const [thisPeriod, setThisPeriod] = useState<{ due_date: string; amount: number | string; paid: boolean; days_left: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedTick, setSubmittedTick] = useState(0)

  const [myDeposits, setMyDeposits] = useState<DepositItem[]>([])
  const [communityDeposits, setCommunityDeposits] = useState<DepositItem[]>([])
  const [historyDeposits, setHistoryDeposits] = useState<DepositItem[]>([])
  const [reviewDeposits, setReviewDeposits] = useState<DepositItem[]>([])

  const [myLoading, setMyLoading] = useState(false)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<"verified" | "rejected" | null>(null)

  const selectedPolicy = activePolicies.find((p) => p.policy_id === selectedPolicyId) ?? null

  const fetchActivePolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      // Deposits strictly use the single current deposit policy
      const res = await apiClient.get("/policies/deposit/current")
      const current = res.data as DepositPolicy | null
      setActivePolicies(current ? [current] : [])
      setSelectedPolicyId(current?.policy_id ?? "")
    } catch {
      setActivePolicies([])
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivePolicies()
  }, [fetchActivePolicies])

  useEffect(() => {
    let cancelled = false
    apiClient
      .get("/dashboard/me")
      .then((res) => !cancelled && setThisPeriod(res.data.next_due ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [submittedTick])

  const processOcr = async (file: File) => {
    setOcrLoading(true)
    setOcrError(null)
    setOcrResult(null)
    setOcrDetected(null)
    setReceiptId(null)
    setPreview(null)
    setPreviewError(null)
    setAllocations([])

    try {
      const formData = new FormData()
      formData.append("file", file)

      const uploadRes = await apiClient.post("/v1/ocr/process-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      const taskId = uploadRes.data.task_id
      setReceiptId(uploadRes.data.receipt_id ?? null)
      const startedAt = Date.now()
      const poll = async (): Promise<OcrResult> => {
        const statusRes = await apiClient.get(`/v1/ocr/task-status/${taskId}`)
        const data = statusRes.data

        if (data.status === "completed") {
          const taskResult = data.result
          return (taskResult?.data ?? taskResult) as OcrResult
        }
        if (data.status === "failed") {
          throw new Error(data.message || t("OCR processing failed"))
        }
        if (Date.now() - startedAt > OCR_POLL_TIMEOUT_MS) {
          throw new Error(t("Reading the voucher is taking longer than expected."))
        }
        await new Promise((r) => setTimeout(r, OCR_POLL_INTERVAL))
        return poll()
      }

      const result = normalizeOcrResult(await poll())
      setOcrResult(result)
      setOcrDetected(result)
    } catch (err: unknown) {
      setOcrError(
        (err instanceof Error ? err.message : t("OCR processing failed")) + " " + t("You can enter the voucher details manually below."),
      )
      // Fall back to manual entry so the member isn't stuck
      setOcrResult({ ...EMPTY_OCR_RESULT })
      setOcrDetected(null)
    } finally {
      setOcrLoading(false)
      // Scroll to the Summary once the preview that follows has rendered.
      scrollToSummaryRef.current = true
    }
  }

  const fetchPreview = useCallback(async () => {
    if (!ocrResult || !selectedPolicyId || !voucherIsComplete(ocrResult)) return

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const res = await apiClient.post("/deposits/preview", {
        policy_id: selectedPolicyId,
        ocr_amount: ocrResult.amount,
        ocr_charge: ocrResult.charge ?? 0,
        ocr_reference: ocrResult.reference,
      })
      const data = res.data as PreviewResponse
      const normalized: PreviewResponse = {
        ...data,
        ocr_amount: Number(data.ocr_amount),
        ocr_charge: Number(data.ocr_charge),
        net_amount: Number(data.net_amount),
        required_deposit: Number(data.required_deposit),
        fine_amount: Number(data.fine_amount),
        fine_percentage: Number(data.fine_percentage),
        excess_amount: Number(data.excess_amount),
        active_loans: (data.active_loans || []).map((ln) => ({
          ...ln,
          principal_paisa: Number(ln.principal_paisa),
          accrued_interest_paisa: Number(ln.accrued_interest_paisa),
          total_paid_paisa: Number(ln.total_paid_paisa),
          outstanding_principal_paisa: Number(ln.outstanding_principal_paisa),
          outstanding_interest_paisa: Number(ln.outstanding_interest_paisa),
          interest_rate: Number(ln.interest_rate),
          service_charge_due_paisa: Number(ln.service_charge_due_paisa ?? 0),
        })),
      }
      setPreview(normalized)
      if (scrollToSummaryRef.current) {
        scrollToSummaryRef.current = false
        setSummaryScrollTick((n) => n + 1)
      }
      if (preserveAllocationsRef.current) {
        // Keep the split we loaded for editing instead of re-defaulting it.
        preserveAllocationsRef.current = false
      } else {
        // Start from a sensible split the member can tweak, not a blank slate.
        setAllocations(buildDefaultAllocations(normalized))
      }
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : t("Failed to compute deposit preview"))
    } finally {
      setPreviewLoading(false)
    }
  }, [ocrResult, selectedPolicyId])

  // Debounced so editing the voucher fields doesn't fire a request per keystroke
  useEffect(() => {
    if (!ocrResult || !selectedPolicyId || !voucherIsComplete(ocrResult)) {
      setPreview(null)
      return
    }
    const timer = setTimeout(fetchPreview, 500)
    return () => clearTimeout(timer)
  }, [ocrResult, selectedPolicyId, fetchPreview])

  const updateVoucher = (changes: Partial<OcrResult>) => {
    setOcrResult((prev) => ({ ...(prev ?? EMPTY_OCR_RESULT), ...changes }))
  }

  const mapDepositItem = (raw: DepositItem): DepositItem => ({
    ...raw,
    deposited_amount: Number(raw.deposited_amount),
  })

  const fetchMyDeposits = useCallback(async () => {
    setMyLoading(true)
    try {
      const res = await apiClient.get("/deposits/me")
      setMyDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setMyDeposits([])
    } finally {
      setMyLoading(false)
    }
  }, [])

  const [communityFilters, setCommunityFilters] = useState<CommunityFilterValues>(EMPTY_COMMUNITY_FILTERS)
  const fetchCommunityDeposits = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const res = await apiClient.get("/deposits/community", {
        params: { limit: 100, ...communityFilterParams(communityFilters, { choice: "type" }) },
      })
      setCommunityDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setCommunityDeposits([])
    } finally {
      setCommunityLoading(false)
    }
  }, [communityFilters])

  // Re-query when filters change; on reopening the tab, only refetch when the
  // data is stale (older than 30s), otherwise keep what's already loaded — no
  // spinner, no redundant request on quick tab-switching.
  const communityFetchRef = useRef({ at: 0, key: "" })
  useEffect(() => {
    if (activeTab !== "community") return
    const key = JSON.stringify(communityFilters)
    const filtersChanged = communityFetchRef.current.key !== key
    const stale = Date.now() - communityFetchRef.current.at > 30_000
    if (!filtersChanged && !stale) return
    const timer = setTimeout(() => {
      communityFetchRef.current = { at: Date.now(), key }
      fetchCommunityDeposits()
    }, filtersChanged ? 300 : 0)
    return () => clearTimeout(timer)
  }, [communityFilters, activeTab, fetchCommunityDeposits])

  const fetchHistoryDeposits = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await apiClient.get("/deposits/history")
      setHistoryDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setHistoryDeposits([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const fetchReviewDeposits = useCallback(async () => {
    if (!isDepositReviewer) return
    setReviewLoading(true)
    try {
      const res = await apiClient.get("/deposits/review/pending")
      setReviewDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setReviewDeposits([])
    } finally {
      setReviewLoading(false)
    }
  }, [isDepositReviewer])

  useEffect(() => {
    if (activeTab === "my") fetchMyDeposits()
    // "community" loads via the debounced filter effect
    if (activeTab === "history") fetchHistoryDeposits()
    if (activeTab === "review") fetchReviewDeposits()
  }, [activeTab, fetchMyDeposits, fetchHistoryDeposits, fetchReviewDeposits])

  const addAllocation = () => {
    if (!preview) return
    // Append a blank row the member fills in; its category and loan are
    // editable on the row itself. Advance is a sensible default extra split.
    setAllocations((prev) => [
      ...prev,
      { category: "advance", label: categoryLabel("advance"), amount_rupees: 0, loan_id: null },
    ])
  }

  const updateAllocationCategory = (index: number, category: SplitCategory) => {
    setAllocations((prev) => {
      const next = [...prev]
      const isLoan = LOAN_CATEGORIES.includes(category)
      let loanId = next[index].loan_id
      if (isLoan) {
        const applicable = (preview?.active_loans ?? []).filter(
          (ln) => category !== "service_charge" || ln.service_charge_due_paisa > 0,
        )
        if (!loanId || !applicable.some((ln) => ln.loan_id === loanId)) {
          loanId = applicable[0]?.loan_id ?? null
        }
      } else {
        loanId = null
      }
      next[index] = { ...next[index], category, label: categoryLabel(category), loan_id: loanId }
      return next
    })
  }

  const updateAllocationLoan = (index: number, loanId: string) => {
    setAllocations((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], loan_id: loanId }
      return next
    })
  }

  const updateAllocationAmount = (index: number, value: number) => {
    setAllocations((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], amount_rupees: Math.max(0, value || 0) }
      return next
    })
  }

  const removeAllocation = (index: number) => {
    setAllocations((prev) => prev.filter((_, i) => i !== index))
  }

  const clearFile = () => {
    setSelectedFile(null)
    setOcrResult(null)
    setOcrDetected(null)
    setReceiptId(null)
    setOcrError(null)
    setPreview(null)
    setAllocations([])
    setSubmitError(null)
    setEditingDepositId(null)
    preserveAllocationsRef.current = false
  }

  const handleSubmit = async () => {
    if (!preview || !ocrResult) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const payload = {
        policy_id: selectedPolicyId || null,
        ocr_amount: ocrResult.amount,
        ocr_charge: ocrResult.charge ?? 0,
        ocr_reference: ocrResult.reference,
        receipt_id: receiptId,
        allocations: allocations.map((a) => ({
          category: a.category,
          amount_rupees: a.amount_rupees,
          loan_id: a.loan_id,
        })),
      }

      if (editingDepositId) {
        await apiClient.put(`/deposits/deposit/${editingDepositId}/smart`, payload)
      } else {
        await apiClient.post("/deposits/smart", payload)
      }
      fetchMyDeposits()
      fetchHistoryDeposits()
      if (isDepositReviewer) fetchReviewDeposits()
      clearFile()
      setSubmittedTick((n) => n + 1)
      toast.success(
        isTreasurer
          ? t("Deposit submitted — the Secretary has been notified for verification.")
          : t("Deposit submitted — the Treasurer has been notified for verification."),
      )
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSubmitError(detail ?? (err instanceof Error ? err.message : t("Failed to submit deposit")))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReviewAction = async (depositId: string, status: "verified" | "rejected") => {
    setActionLoadingId(depositId)
    setActionType(status)
    try {
      await apiClient.put(`/deposits/deposit/${depositId}/moderator`, {
        verification_status: status,
      })
      fetchReviewDeposits()
      fetchMyDeposits()
      fetchCommunityDeposits()
      fetchHistoryDeposits()
    } finally {
      setActionLoadingId(null)
      setActionType(null)
    }
  }

  const handleWithdrawDeposit = async (depositId: string) => {
    setActionLoadingId(depositId)
    setActionType(null)
    try {
      await apiClient.delete(`/deposits/deposit/${depositId}/me`)
      fetchMyDeposits()
      fetchHistoryDeposits()
      toast.success(t("Deposit withdrawn."))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? t("Failed to withdraw deposit"))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleEditDeposit = async (depositId: string) => {
    setActionLoadingId(depositId)
    setActionType(null)
    try {
      const res = await apiClient.get(`/deposits/deposit/${depositId}/smart-edit`)
      const d = res.data
      setSelectedPolicyId(d.policy_id ?? "")
      setOcrResult({
        amount: d.ocr_amount != null ? Number(d.ocr_amount) : null,
        charge: d.ocr_charge != null ? Number(d.ocr_charge) : null,
        date: d.ocr_date ?? null,
        reference: d.ocr_reference ?? null,
      })
      setOcrDetected(null)
      setReceiptId(d.receipt_id ?? null)
      const loaded = (d.allocations ?? []).map((a: { category: SplitCategory; amount_rupees: number | string; loan_id: string | null }) => ({
        category: a.category,
        label: categoryLabel(a.category),
        amount_rupees: Number(a.amount_rupees),
        loan_id: a.loan_id ?? null,
      }))
      preserveAllocationsRef.current = true
      setAllocations(loaded)
      setEditingDepositId(depositId)
      setSubmitError(null)
      setActiveTab("make")
      toast.success(t("Editing your pending deposit. Adjust the values and resubmit."))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? t("Could not load the deposit for editing."))
    } finally {
      setActionLoadingId(null)
    }
  }

  const allocTotal = allocations.reduce((sum, a) => sum + a.amount_rupees, 0)
  const netAmount = preview?.net_amount ?? 0
  const allocationDiff = netAmount - allocTotal

  // Mirror the server rule: the policy minimum applies to the regular-deposit
  // portion only (a fine- or loan-only voucher is exempt), and a fine can't
  // exceed the fine actually due.
  const depositAlloc = allocations.filter((a) => a.category === "deposit").reduce((s, a) => s + a.amount_rupees, 0)
  const fineAlloc = allocations.filter((a) => a.category === "fine").reduce((s, a) => s + a.amount_rupees, 0)
  const requiredDeposit = preview?.required_deposit ?? 0
  const fineDue = preview?.fine_amount ?? 0
  const blockReason: string | null = !preview
    ? null
    : depositAlloc > 0 && depositAlloc + 1 < requiredDeposit
      ? t("A regular deposit must be at least {0}.", formatRsFromRupees(requiredDeposit))
      : depositAlloc > 0 && fineDue > 0 && fineAlloc + 1 < fineDue
        ? t("This deposit is late — also allocate the {0} late fine.", formatRsFromRupees(fineDue))
        : fineAlloc > fineDue + 1
          ? t("The late fine due is {0}{1}. You allocated {2}.", formatRsFromRupees(fineDue), fineDue === 0 ? t(" (this deposit is not late)") : "", formatRsFromRupees(fineAlloc))
          : null

  const canSubmit =
    !!preview &&
    !blockReason &&
    !submitting &&
    allocations.length > 0 &&
    Math.abs(allocationDiff) < 1

  const renderDepositTable = (
    rows: DepositItem[],
    loading: boolean,
    showUser = false,
    showWithdrawAction = false
  ) => (
    <>
    {/* Phones: one card per deposit instead of a cramped table */}
    <ul className="flex flex-col divide-y sm:hidden">
      {loading ? (
        <li className="py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></li>
      ) : rows.length === 0 ? (
        <li className="py-8 text-center text-sm text-muted-foreground">{t("No records found.")}</li>
      ) : (
        rows.map((dep) => (
          <li key={dep.id} className="flex flex-col gap-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-nums text-sm font-semibold">{formatRsFromRupees(Number(dep.deposited_amount))}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {showUser && <>{dep.depositor_name ?? t("Member")} · </>}
                  {formatDate(dep.deposited_date || dep.created_at)} · <span className="capitalize">{enumLabel(dep.deposit_type)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t("Due {0}", formatDate(dep.due_deposit_date))}</p>
              </div>
              {depositStatusBadge(dep.verification_status)}
            </div>
            {showWithdrawAction && dep.verification_status === "pending" && (
              <div className="flex gap-2 self-start">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleEditDeposit(dep.id)}
                  disabled={actionLoadingId === dep.id}
                >
                  {actionLoadingId === dep.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Pencil className="mr-1 h-3.5 w-3.5" />}
                  {t("Edit")}</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-destructive"
                  onClick={() => handleWithdrawDeposit(dep.id)}
                  disabled={actionLoadingId === dep.id}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  {t("Withdraw")}</Button>
              </div>
            )}
          </li>
        ))
      )}
    </ul>
    <div className="hidden overflow-x-auto sm:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">{t("Date")}</TableHead>
            {showUser && <TableHead className="text-xs">{t("User")}</TableHead>}
            <TableHead className="text-xs">{t("Amount")}</TableHead>
            <TableHead className="text-xs">{t("Type")}</TableHead>
            <TableHead className="text-xs">{t("Due Date")}</TableHead>
            <TableHead className="text-xs">{t("Status")}</TableHead>
            {showWithdrawAction && <TableHead className="text-xs text-right">{t("Action")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={showWithdrawAction ? (showUser ? 7 : 6) : (showUser ? 6 : 5)} className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showWithdrawAction ? (showUser ? 7 : 6) : (showUser ? 6 : 5)} className="py-8 text-center text-sm text-muted-foreground">
                {t("No records found.")}</TableCell>
            </TableRow>
          ) : (
            rows.map((dep) => (
              <TableRow key={dep.id}>
                <TableCell className="text-xs">{formatDate(dep.deposited_date || dep.created_at)}</TableCell>
                {showUser && (
                  <TableCell className="text-xs">{dep.depositor_name ?? `${dep.user_id.slice(0, 8)}…`}</TableCell>
                )}
                <TableCell className="text-xs font-medium">{formatRsFromRupees(Number(dep.deposited_amount))}</TableCell>
                <TableCell className="text-xs capitalize">{enumLabel(dep.deposit_type)}</TableCell>
                <TableCell className="text-xs">{formatDate(dep.due_deposit_date)}</TableCell>
                <TableCell>{depositStatusBadge(dep.verification_status)}</TableCell>
                {showWithdrawAction && (
                  <TableCell className="text-right">
                    {dep.verification_status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleEditDeposit(dep.id)}
                          disabled={actionLoadingId === dep.id}
                        >
                          {actionLoadingId === dep.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t("Edit")}</Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive"
                          onClick={() => handleWithdrawDeposit(dep.id)}
                          disabled={actionLoadingId === dep.id}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" />
                          {t("Withdraw")}</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("Deposits")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Submit deposits, track verification status, and manage pending submissions")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`h-auto w-full justify-start overflow-x-auto [scrollbar-width:none] [&>button]:shrink-0 sm:grid ${isDepositReviewer ? "sm:max-w-2xl sm:grid-cols-5" : "sm:max-w-xl sm:grid-cols-4"}`}>
          <TabsTrigger value="make" className="gap-1">
            <Banknote className="h-4 w-4" />
            {t("Make Deposit")}</TabsTrigger>
          <TabsTrigger value="my" className="gap-1">
            <ListChecks className="h-4 w-4" />
            {t("My Deposits")}</TabsTrigger>
          <TabsTrigger value="community" className="gap-1">
            <Users className="h-4 w-4" />
            {t("Community")}</TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" />
            {t("History")}</TabsTrigger>
          {isDepositReviewer && (
            <TabsTrigger value="review" className="gap-1">
              <ShieldCheck className="h-4 w-4" />
              {t("Review")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="make" className="mt-4 flex flex-col gap-6">
          {editingDepositId && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm text-primary">
                {t("You're editing a pending deposit — submitting will replace it.")}</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFile}>
                {t("Cancel edit")}</Button>
            </div>
          )}
          {thisPeriod && (
            <div
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
                thisPeriod.paid ? "border-success/30 bg-success/5" : thisPeriod.days_left <= 3 ? "border-warning/40 bg-warning/10" : "bg-card"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  thisPeriod.paid ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                }`}
              >
                {thisPeriod.paid ? <CheckCircle2 className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {thisPeriod.paid
                    ? t("This period's deposit is in: {0} for {1}", formatRsFromRupees(Number(thisPeriod.amount)), formatDate(thisPeriod.due_date))
                    : t("{0} due by {1}", formatRsFromRupees(Number(thisPeriod.amount)), formatDate(thisPeriod.due_date))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {thisPeriod.paid
                    ? t("Check its status under My Deposits. You can also pay ahead or towards your loan below.")
                    : thisPeriod.days_left <= 0
                      ? t("Due today. Deposits after the due date get the late fine.")
                      : thisPeriod.days_left === 1
                        ? t("{0} day left. Deposits after the due date get the late fine.", 1)
                        : t("{0} days left. Deposits after the due date get the late fine.", thisPeriod.days_left)}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold">{t("Make a deposit")}</CardTitle>
                  <CardDescription>{t("Pay at the bank first, then upload the voucher here.")}</CardDescription>
                </div>
                <ol className="grid grid-cols-4 gap-2" aria-label={t("Steps")}>
                  {["Policy", "Voucher", "Check & split", "Submit"].map((label, i) => {
                    const step = !selectedPolicyId ? 0 : !ocrResult ? 1 : !canSubmit ? 2 : 3
                    const state = i < step ? "done" : i === step ? "current" : "todo"
                    return (
                      <li key={label} className="flex flex-col gap-1.5">
                        <span
                          className={`h-1.5 rounded-full ${state === "todo" ? "bg-muted" : "bg-primary"} ${state === "current" ? "opacity-60" : ""}`}
                        />
                        <span className={`text-[11px] ${state === "todo" ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                          {n(i + 1)}. {t(label)}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">{t("Current deposit policy")}</Label>
                  {policiesLoading ? (
                    <div className="flex h-14 items-center gap-2 rounded-lg border px-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("Loading the current policy…")}</span>
                    </div>
                  ) : selectedPolicy ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Landmark className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-nums text-sm font-semibold">{formatRs(selectedPolicy.amount_paisa)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("{0} · late fine {1}% · in force since {2}", scheduleText(selectedPolicy), selectedPolicy.late_deposit_fine, formatDate(selectedPolicy.effective_from))}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground dark:text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {t("No deposit policy is in force right now, so deposits can't be made. Please contact the Treasurer.")}</div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">{t("Payment voucher")}</Label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setIsDragging(false)
                      const file = e.dataTransfer.files[0]
                      if (!file) return
                      setSelectedFile(file)
                      processOcr(file)
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${isDragging
                      ? "border-primary bg-accent"
                      : selectedFile
                        ? "border-success/50 bg-success/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                      }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setSelectedFile(file)
                        processOcr(file)
                      }}
                    />
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-success" />
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 text-xs text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            clearFile()
                          }}
                        >
                          <X className="mr-1 h-3 w-3" />
                          {t("Remove")}</Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground/60" />
                        <p className="text-sm font-medium">
                          <span className="sm:hidden">{t("Tap to take a photo or choose a screenshot")}</span>
                          <span className="hidden sm:inline">{t("Drop the voucher here or click to choose it")}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{t("Bank app screenshot or photo · JPG, PNG or WEBP up to 10 MB")}</p>
                      </div>
                    )}
                  </div>
                </div>

                {ocrLoading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium text-primary">{t("Processing voucher...")}</p>
                  </div>
                )}

                {ocrError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{ocrError}</p>
                  </div>
                )}

                {ocrResult && (() => {
                  const detected = ocrDetected
                  const amountEdited = !!detected && ocrResult.amount !== detected.amount
                  const refEdited = !!detected && (ocrResult.reference ?? "") !== (detected.reference ?? "")
                  const ocrHint = (edited: boolean, original: string) =>
                    edited ? (
                      <p className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        {t("Edited. OCR read: ")}{original}
                      </p>
                    ) : null

                  return (
                    <div className="rounded-lg border p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <ScanLine className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("Voucher Details")}</p>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {t("{0} The treasurer verifies every deposit before it counts.{1}", detected
                          ? t("Check these against your voucher and correct anything OCR misread.")
                          : t("Enter the details exactly as shown on your voucher."), receiptId &&
                          t(" Your voucher image is kept for 15 days so the treasurer can check it, then deleted."))}
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="voucher-amount" className="text-xs font-medium text-muted-foreground">
                            {t("Deposited Amount (Rs.)")}</Label>
                          <div className="relative">
                            <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="voucher-amount"
                              type="number"
                              inputMode="decimal"
                              min={0.01}
                              step={0.01}
                              placeholder={t("Not detected, enter amount")}
                              className="pl-8 font-nums font-semibold"
                              value={ocrResult.amount ?? ""}
                              onChange={(e) =>
                                updateVoucher({ amount: e.target.value === "" ? null : Number(e.target.value) })
                              }
                            />
                          </div>
                          {ocrHint(
                            amountEdited,
                            detected?.amount != null ? formatRsFromRupees(detected.amount) : t("nothing"),
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="voucher-ref" className="text-xs font-medium text-muted-foreground">
                            {t("Voucher Reference")}</Label>
                          <div className="relative">
                            <Receipt className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="voucher-ref"
                              maxLength={64}
                              placeholder={t("Reference code / transaction ID")}
                              className="pl-8 font-mono"
                              value={ocrResult.reference ?? ""}
                              onChange={(e) => updateVoucher({ reference: e.target.value || null })}
                            />
                          </div>
                          {ocrHint(refEdited, detected?.reference || "nothing")}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {previewLoading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium text-primary">{t("Computing summary...")}</p>
                  </div>
                )}

                {previewError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{previewError}</p>
                  </div>
                )}

                {preview && (
                  <div ref={summaryRef} className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("Summary")}</p>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Net Amount")}</p>
                        <p className="font-nums text-sm font-bold">{formatRsFromRupees(preview.net_amount)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Policy Amount")}</p>
                        <p className="font-nums text-sm font-bold">{formatRsFromRupees(preview.required_deposit)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Late Deposit Fine")}</p>
                        <p className="font-nums text-sm font-bold">{formatRsFromRupees(preview.fine_amount)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Due Date")}</p>
                        <p className="text-sm font-medium">{formatDate(preview.due_date)}</p>
                      </div>
                    </div>

                    {blockReason && (
                      <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive/90">{blockReason}</p>
                      </div>
                    )}

                    <Separator className="my-3" />
                    <div className="mb-2 flex flex-col gap-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("How this deposit is applied")}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("Auto-filled from your deposit — adjust the amounts if you need to.")}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {allocations.length === 0 ? (
                        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                          {t("Nothing to allocate yet.")}</div>
                      ) : (
                        allocations.map((alloc, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2.5">
                            <Select value={alloc.category} onValueChange={(v) => updateAllocationCategory(idx, v as SplitCategory)}>
                              <SelectTrigger className="h-8 w-44 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="deposit">{t("Regular Deposit")}</SelectItem>
                                <SelectItem value="fine">{t("Late Deposit Fine")}</SelectItem>
                                <SelectItem value="advance">{t("Advance Deposit")}</SelectItem>
                                <SelectItem value="loan_principal">{t("Loan Principal")}</SelectItem>
                                <SelectItem value="loan_interest">{t("Loan Interest")}</SelectItem>
                                <SelectItem value="loan_renewal">{t("Loan Renewal")}</SelectItem>
                                {preview.active_loans.some((ln) => ln.service_charge_due_paisa > 0) && (
                                  <SelectItem value="service_charge">{t("Service Charge")}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>

                            {LOAN_CATEGORIES.includes(alloc.category) && (
                              <Select value={alloc.loan_id ?? ""} onValueChange={(v) => updateAllocationLoan(idx, v)}>
                                <SelectTrigger className="h-8 w-52 text-xs">
                                  <SelectValue placeholder={t("Select loan")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {preview.active_loans
                                    .filter((ln) => alloc.category !== "service_charge" || ln.service_charge_due_paisa > 0)
                                    .map((ln) => (
                                      <SelectItem key={ln.loan_id} value={ln.loan_id}>
                                        {alloc.category === "service_charge"
                                          ? t("Loan of {0} · service charge {1} left", formatRs(ln.principal_paisa / 100), formatRs(ln.service_charge_due_paisa / 100))
                                          : t("Loan of {0} · {1} left", formatRs(ln.principal_paisa / 100), formatRs(ln.outstanding_principal_paisa / 100))}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}

                            <div className="ml-auto flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">{t("Rs.")}</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                className="h-8 w-28 font-nums text-sm"
                                value={alloc.amount_rupees === 0 ? "" : String(alloc.amount_rupees)}
                                placeholder="0"
                                onChange={(e) => updateAllocationAmount(idx, Number(e.target.value || 0))}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => removeAllocation(idx)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {preview.active_loans.some((ln) => ln.outstanding_principal_paisa > 0 || ln.service_charge_due_paisa > 0) &&
                      !allocations.some((a) => LOAN_CATEGORIES.includes(a.category)) && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                          {t("You have a loan due — use “Add category” to put part of this deposit toward it.")}</p>
                      )}

                    <div className="mt-3">
                      <Button variant="outline" size="sm" className="gap-1" onClick={addAllocation}>
                        <Plus className="h-4 w-4" />
                        {t("Add category")}</Button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-md border bg-background p-2 text-xs">
                        <span className="text-muted-foreground">{t("Net:")}</span> {formatRsFromRupees(netAmount)}
                      </div>
                      <div className="rounded-md border bg-background p-2 text-xs">
                        <span className="text-muted-foreground">{t("Allocated:")}</span> {formatRsFromRupees(allocTotal)}
                      </div>
                      <div className={`rounded-md border p-2 text-xs ${Math.abs(allocationDiff) < 1 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                        <span className="text-muted-foreground">{t("Remaining:")}</span> {formatRsFromRupees(allocationDiff)}
                      </div>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{submitError}</p>
                  </div>
                )}


                <Button className="h-10 w-full sm:w-auto sm:self-end" disabled={!canSubmit} onClick={handleSubmit}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {t("Submit")}</Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 lg:self-start">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Landmark className="h-4 w-4 text-primary" />
                  {t("How deposits work")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4">
                  {[
                    ["Pay at the bank", "Transfer the amount to the cooperative's account, in your bank app or at the counter."],
                    ["Upload the voucher", "We read the amount, date and reference from it. Check them and correct anything that's wrong."],
                    ["Split the money", "Choose what it covers: this period's deposit, a late fine, an advance, or your loan."],
                    ["Treasurer verifies", "It counts once the Treasurer has checked it against the bank. The voucher image is kept for 15 days for that."],
                  ].map(([title, d], i) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {n(i + 1)}
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{t(title)}</span>
                        <span className="block text-xs text-muted-foreground">{t(d)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("My Deposits")}</CardTitle>
              <CardDescription>
                {t("Your submitted deposits. Pending deposits can be withdrawn for editing and resubmission.")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {renderDepositTable(myDeposits, myLoading, false, true)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Community Deposits")}</CardTitle>
              <CardDescription>{t("Verified deposits across the cooperative")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <CommunityFilters
                values={communityFilters}
                onChange={setCommunityFilters}
                choice={{ label: "Type", options: [{ value: "current", label: "Current" }, { value: "advance", label: "Advance" }] }}
                resultCount={communityLoading && communityDeposits.length === 0 ? undefined : communityDeposits.length}
              />
              {communityLoading && communityDeposits.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t(" Loading…")}</div>
              ) : communityDeposits.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {Object.values(communityFilters).some(Boolean) ? t("No deposits match these filters.") : t("No community deposits yet.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("Depositor")}</TableHead>
                        <TableHead className="text-right text-xs">{t("Amount")}</TableHead>
                        <TableHead className="text-xs">{t("Deposit date")}</TableHead>
                        <TableHead className="text-xs">{t("Type")}</TableHead>
                        <TableHead className="text-xs">{t("Verified by")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {communityDeposits.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm font-medium">{d.depositor_name ?? "—"}</TableCell>
                          <TableCell className="font-nums text-right text-sm font-medium">
                            {formatRsFromRupees(Number(d.deposited_amount))}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateBoth(d.deposited_date)}</TableCell>
                          <TableCell className="text-sm capitalize">{enumLabel(d.deposit_type)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.verified_by ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("History")}</CardTitle>
              <CardDescription>{t("Your verified/rejected deposit history")}</CardDescription>
            </CardHeader>
            <CardContent>{renderDepositTable(historyDeposits, historyLoading)}</CardContent>
          </Card>
        </TabsContent>

        {isDepositReviewer && (
          <TabsContent value="review" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("Review Deposits")}</CardTitle>
                <CardDescription>{t("Deposits waiting for your verification (never your own)")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {reviewLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : reviewDeposits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No pending deposits to review.")}</p>
                ) : (
                  reviewDeposits.map((dep) => {
                    const isThisLoading = actionLoadingId === dep.id
                    return (
                      <div key={dep.id} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                              {(dep.depositor_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                            </span>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{dep.depositor_name ?? t("Member")}</p>
                              <p className="font-nums text-lg font-semibold leading-none">{formatRsFromRupees(Number(dep.deposited_amount))}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("Paid {0} · due {1}", formatDateTime(dep.deposited_date), formatDate(dep.due_deposit_date))}
                              </p>
                              {new Date(dep.deposited_date).getTime() > new Date(dep.due_deposit_date).getTime() ? (
                                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[11px] text-warning-foreground dark:text-warning">
                                  {t("Late: after the due date")}</Badge>
                              ) : (
                                <Badge variant="outline" className="border-success/30 bg-success/10 text-[11px] text-success">
                                  {t("On time")}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {dep.receipt_id ? (
                              <Button size="sm" variant="ghost" onClick={() => setReviewReceiptId(dep.receipt_id)}>
                                <Receipt className="mr-2 h-4 w-4" />
                                {t("View receipt")}</Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("No receipt attached")}</span>
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleReviewAction(dep.id, "verified")}
                              disabled={isThisLoading}
                            >
                              {isThisLoading && actionType === "verified" ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <BadgeCheck className="mr-2 h-4 w-4" />
                              )}
                              {t("Verify")}</Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReviewAction(dep.id, "rejected")}
                              disabled={isThisLoading}
                            >
                              {isThisLoading && actionType === "rejected" ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="mr-2 h-4 w-4" />
                              )}
                              {t("Reject")}</Button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      <ReceiptReviewDialog receiptId={reviewReceiptId} onClose={() => setReviewReceiptId(null)} />
    </div>
  )
}
