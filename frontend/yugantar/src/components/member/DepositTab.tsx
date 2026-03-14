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
  ShieldCheck,
  Clock,
  Users,
  History,
  ListChecks,
  BadgeCheck,
  Ban,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
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
import { useLocation } from "wouter"

type PolicyStatus = "draft" | "finalized" | "active" | "expired" | "void"
type DepositScheduleType = "monthly_fixed_day" | "occasional"
type SplitCategory = "deposit" | "fine" | "advance" | "loan_principal" | "loan_interest" | "loan_renewal"

interface DepositPolicy {
  policy_id: string
  amount_paisa: number
  late_deposit_fine: number
  schedule_type: DepositScheduleType
  due_day_of_month: number | null
  status: PolicyStatus
  effective_from: string
}

interface OcrResult {
  amount: number | null
  charge: number | null
  date: string | null
  reference: string | null
}

interface LoanSummary {
  loan_id: string
  principal_paisa: number
  accrued_interest_paisa: number
  total_paid_paisa: number
  outstanding_principal_paisa: number
  outstanding_interest_paisa: number
  interest_rate: number
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
  created_at: string
}

function formatRs(paisa: number): string {
  const rupees = Math.round(Number(paisa) / 100)
  return `Rs. ${rupees.toLocaleString("en-IN")}`
}

function formatRsFromRupees(rupees: number): string {
  return `Rs. ${Number(rupees || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function depositStatusBadge(status: DepositItem["verification_status"]) {
  if (status === "verified") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </Badge>
    )
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs">
        <AlertCircle className="h-3 w-3" />
        Rejected
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 text-xs">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  )
}

function categoryLabel(category: SplitCategory): string {
  const map: Record<SplitCategory, string> = {
    deposit: "Regular Deposit",
    fine: "Late Fine",
    advance: "Advance Deposit",
    loan_principal: "Loan Principal",
    loan_interest: "Loan Interest",
    loan_renewal: "Loan Renewal",
  }
  return map[category]
}

const OCR_POLL_INTERVAL = 2000

export function DepositTab() {
  const { user } = useAuth()
  const [location] = useLocation()
  const normalizedRoles = (user?.cooperative_roles ?? []).map((role) =>
    String(role).toLowerCase()
  )
  const isTreasurer = normalizedRoles.includes("treasurer")

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState("make")

  useEffect(() => {
    const query = location.split("?")[1] ?? ""
    const params = new URLSearchParams(query)
    const subtab = params.get("subtab")
    if (!subtab) return

    const allowedTabs = isTreasurer
      ? ["make", "my", "community", "history", "review"]
      : ["make", "my", "community", "history"]

    if (allowedTabs.includes(subtab)) {
      setActiveTab(subtab)
    }
  }, [location, isTreasurer])

  const [activePolicies, setActivePolicies] = useState<DepositPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("")

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [allocations, setAllocations] = useState<SplitAllocation[]>([])
  const [newCategory, setNewCategory] = useState<SplitCategory>("deposit")
  const [selectedLoanId, setSelectedLoanId] = useState<string>("")

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

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
      const res = await apiClient.get("/policies/deposit")
      const active = (res.data as DepositPolicy[]).filter((p) => p.status === "active")
      setActivePolicies(active)
      if (active.length > 0 && !selectedPolicyId) setSelectedPolicyId(active[0].policy_id)
    } catch {
      setActivePolicies([])
    } finally {
      setPoliciesLoading(false)
    }
  }, [selectedPolicyId])

  useEffect(() => {
    fetchActivePolicies()
  }, [fetchActivePolicies])

  const processOcr = async (file: File) => {
    setOcrLoading(true)
    setOcrError(null)
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
      const poll = async (): Promise<OcrResult> => {
        const statusRes = await apiClient.get(`/v1/ocr/task-status/${taskId}`)
        const data = statusRes.data

        if (data.status === "completed") {
          const taskResult = data.result
          return (taskResult?.data ?? taskResult) as OcrResult
        }
        if (data.status === "failed") {
          throw new Error(data.message || "OCR processing failed")
        }
        await new Promise((r) => setTimeout(r, OCR_POLL_INTERVAL))
        return poll()
      }

      const result = await poll()
      setOcrResult(result)
    } catch (err: unknown) {
      setOcrError(err instanceof Error ? err.message : "OCR processing failed")
    } finally {
      setOcrLoading(false)
    }
  }

  const fetchPreview = useCallback(async () => {
    if (!ocrResult || !selectedPolicyId || ocrResult.amount == null) return

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const res = await apiClient.post("/deposits/preview", {
        policy_id: selectedPolicyId,
        ocr_amount: ocrResult.amount,
        ocr_charge: ocrResult.charge ?? 0,
        ocr_date: ocrResult.date ?? new Date().toISOString(),
        ocr_reference: ocrResult.reference,
      })
      const data = res.data as PreviewResponse
      setPreview({
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
        })),
      })
      setAllocations([])
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Failed to compute deposit preview")
    } finally {
      setPreviewLoading(false)
    }
  }, [ocrResult, selectedPolicyId])

  useEffect(() => {
    if (ocrResult && ocrResult.amount != null && selectedPolicyId) fetchPreview()
  }, [ocrResult, selectedPolicyId, fetchPreview])

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

  const fetchCommunityDeposits = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const res = await apiClient.get("/deposits/community")
      setCommunityDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setCommunityDeposits([])
    } finally {
      setCommunityLoading(false)
    }
  }, [])

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
    if (!isTreasurer) return
    setReviewLoading(true)
    try {
      const res = await apiClient.get("/deposits/review/pending")
      setReviewDeposits((res.data as DepositItem[]).map(mapDepositItem))
    } catch {
      setReviewDeposits([])
    } finally {
      setReviewLoading(false)
    }
  }, [isTreasurer])

  useEffect(() => {
    if (activeTab === "my") fetchMyDeposits()
    if (activeTab === "community") fetchCommunityDeposits()
    if (activeTab === "history") fetchHistoryDeposits()
    if (activeTab === "review") fetchReviewDeposits()
  }, [activeTab, fetchMyDeposits, fetchCommunityDeposits, fetchHistoryDeposits, fetchReviewDeposits])

  const addAllocation = () => {
    if (!preview) return
    const isLoanCategory =
      newCategory === "loan_principal" ||
      newCategory === "loan_interest" ||
      newCategory === "loan_renewal"

    if (isLoanCategory && !selectedLoanId) return

    const duplicate = allocations.some(
      (a) => a.category === newCategory && (a.loan_id || null) === (isLoanCategory ? selectedLoanId : null)
    )
    if (duplicate) return

    setAllocations((prev) => [
      ...prev,
      {
        category: newCategory,
        label: categoryLabel(newCategory),
        amount_rupees: 0,
        loan_id: isLoanCategory ? selectedLoanId : null,
      },
    ])
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
    setOcrError(null)
    setPreview(null)
    setAllocations([])
    setSubmitError(null)
    setSubmitSuccess(false)
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
        ocr_date: ocrResult.date ?? new Date().toISOString(),
        ocr_reference: ocrResult.reference,
        allocations: allocations.map((a) => ({
          category: a.category,
          amount_rupees: a.amount_rupees,
          loan_id: a.loan_id,
        })),
      }

      await apiClient.post("/deposits/smart", payload)
      setSubmitSuccess(true)
      fetchMyDeposits()
      fetchHistoryDeposits()
      if (isTreasurer) fetchReviewDeposits()

      setTimeout(() => {
        clearFile()
      }, 2500)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit deposit")
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
      setActiveTab("make")
      setSubmitSuccess(false)
      setSubmitError("Deposit withdrawn. You can edit details and submit again.")
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail ?? "Failed to withdraw deposit")
    } finally {
      setActionLoadingId(null)
    }
  }

  const allocTotal = allocations.reduce((sum, a) => sum + a.amount_rupees, 0)
  const netAmount = preview?.net_amount ?? 0
  const allocationDiff = netAmount - allocTotal

  const canSubmit =
    !!preview &&
    !submitting &&
    allocations.length > 0 &&
    Math.abs(allocationDiff) < 1

  const renderDepositTable = (
    rows: DepositItem[],
    loading: boolean,
    showUser = false,
    showWithdrawAction = false
  ) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            {showUser && <TableHead className="text-xs">User</TableHead>}
            <TableHead className="text-xs">Amount</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">Due Date</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            {showWithdrawAction && <TableHead className="text-xs text-right">Action</TableHead>}
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
                No records found.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((dep) => (
              <TableRow key={dep.id}>
                <TableCell className="text-xs">{formatDateTime(dep.deposited_date || dep.created_at)}</TableCell>
                {showUser && <TableCell className="text-xs font-mono">{dep.user_id.slice(0, 8)}…</TableCell>}
                <TableCell className="text-xs font-medium">{formatRsFromRupees(Number(dep.deposited_amount))}</TableCell>
                <TableCell className="text-xs capitalize">{dep.deposit_type.replace("_", " ")}</TableCell>
                <TableCell className="text-xs">{formatDate(dep.due_deposit_date)}</TableCell>
                <TableCell>{depositStatusBadge(dep.verification_status)}</TableCell>
                {showWithdrawAction && (
                  <TableCell className="text-right">
                    {dep.verification_status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleWithdrawDeposit(dep.id)}
                        disabled={actionLoadingId === dep.id}
                      >
                        {actionLoadingId === dep.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="mr-1 h-3.5 w-3.5" />
                        )}
                        Withdraw & Edit
                      </Button>
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
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Deposits</h2>
        <p className="text-sm text-muted-foreground">
          Submit deposits, track verification status, and manage pending submissions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${isTreasurer ? "max-w-2xl grid-cols-5" : "max-w-xl grid-cols-4"}`}>
          <TabsTrigger value="make" className="gap-1">
            <Banknote className="h-4 w-4" />
            Make Deposit
          </TabsTrigger>
          <TabsTrigger value="my" className="gap-1">
            <ListChecks className="h-4 w-4" />
            My Deposits
          </TabsTrigger>
          <TabsTrigger value="community" className="gap-1">
            <Users className="h-4 w-4" />
            Community
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          {isTreasurer && (
            <TabsTrigger value="review" className="gap-1">
              <ShieldCheck className="h-4 w-4" />
              Review
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="make" className="mt-4 flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Make Deposit</CardTitle>
                <CardDescription>
                  Upload voucher, review summary, then manually add split categories before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Select Deposit Policy</Label>
                  {policiesLoading ? (
                    <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading policies...</span>
                    </div>
                  ) : (
                    <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Choose a deposit policy" />
                      </SelectTrigger>
                      <SelectContent>
                        {activePolicies.map((p) => (
                          <SelectItem key={p.policy_id} value={p.policy_id}>
                            {formatRs(p.amount_paisa)} · {p.schedule_type.replace(/_/g, " ")}
                            {p.due_day_of_month ? ` · Due day ${p.due_day_of_month}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedPolicy && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-medium">Policy Amount</Label>
                      <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                        <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-sm font-semibold">{formatRs(selectedPolicy.amount_paisa)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-medium">Late Fine</Label>
                      <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{selectedPolicy.late_deposit_fine}%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Upload Payment Voucher</Label>
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
                      accept=".jpg,.jpeg,.png"
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
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground/60" />
                        <p className="text-sm font-medium">Drop voucher here or click to browse</p>
                        <p className="text-xs text-muted-foreground">JPG/PNG up to 10MB</p>
                      </div>
                    )}
                  </div>
                </div>

                {ocrLoading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium text-primary">Processing voucher...</p>
                  </div>
                )}

                {ocrError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{ocrError}</p>
                  </div>
                )}

                {ocrResult && (
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ScanLine className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Voucher Details</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium text-muted-foreground">Deposited Amount</Label>
                        <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-sm font-semibold">
                            {ocrResult.amount != null ? formatRsFromRupees(ocrResult.amount) : "Not detected"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium text-muted-foreground">Deposited Date</Label>
                        <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {ocrResult.date ? formatDateTime(ocrResult.date) : "Not detected"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {ocrResult.reference && (
                      <div className="mt-3 flex flex-col gap-1">
                        <Label className="text-xs font-medium text-muted-foreground">Voucher Reference</Label>
                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3">
                          <Receipt className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-sm">{ocrResult.reference}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {previewLoading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium text-primary">Computing summary...</p>
                  </div>
                )}

                {previewError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{previewError}</p>
                  </div>
                )}

                {preview && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Summary</p>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Amount</p>
                        <p className="font-mono text-sm font-bold">{formatRsFromRupees(preview.net_amount)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Policy Amount</p>
                        <p className="font-mono text-sm font-bold">{formatRsFromRupees(preview.required_deposit)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Late Fine</p>
                        <p className="font-mono text-sm font-bold">{formatRsFromRupees(preview.fine_amount)}</p>
                      </div>
                      <div className="rounded-md border bg-background p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due Date</p>
                        <p className="text-sm font-medium">{formatDate(preview.due_date)}</p>
                      </div>
                    </div>

                    {preview.is_insufficient && (
                      <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive/90">
                          Net amount is lower than policy amount + fine. You can still allocate categories manually,
                          but ensure your allocation total matches net amount.
                        </p>
                      </div>
                    )}

                    <Separator className="my-3" />
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Manually Allocate Your Deposit
                    </p>

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Select value={newCategory} onValueChange={(v) => setNewCategory(v as SplitCategory)}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deposit">Regular Deposit</SelectItem>
                          <SelectItem value="fine">Late Fine</SelectItem>
                          <SelectItem value="advance">Advance Deposit</SelectItem>
                          <SelectItem value="loan_principal">Loan Principal</SelectItem>
                          <SelectItem value="loan_interest">Loan Interest</SelectItem>
                          <SelectItem value="loan_renewal">Loan Renewal</SelectItem>
                        </SelectContent>
                      </Select>

                      {(newCategory === "loan_principal" || newCategory === "loan_interest" || newCategory === "loan_renewal") && (
                        <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder="Select loan" />
                          </SelectTrigger>
                          <SelectContent>
                            {preview.active_loans.map((ln) => (
                              <SelectItem key={ln.loan_id} value={ln.loan_id}>
                                Loan {ln.loan_id.slice(0, 8)} · Principal {formatRs(ln.principal_paisa)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <Button variant="outline" className="gap-1" onClick={addAllocation}>
                        <Plus className="h-4 w-4" />
                        Add Category
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {allocations.length === 0 ? (
                        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                          No allocations yet. Add categories manually.
                        </div>
                      ) : (
                        allocations.map((alloc, idx) => (
                          <div key={`${alloc.category}-${alloc.loan_id ?? idx}`} className="flex items-center gap-2 rounded-md border bg-background p-2.5">
                            <Badge variant="outline" className="text-[10px]">
                              {categoryLabel(alloc.category)}
                            </Badge>
                            {alloc.loan_id && (
                              <span className="text-[11px] text-muted-foreground font-mono">Loan {alloc.loan_id.slice(0, 8)}…</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Rs.</span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                className="h-8 w-28 font-mono text-sm"
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

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-md border bg-background p-2 text-xs">
                        <span className="text-muted-foreground">Net:</span> {formatRsFromRupees(netAmount)}
                      </div>
                      <div className="rounded-md border bg-background p-2 text-xs">
                        <span className="text-muted-foreground">Allocated:</span> {formatRsFromRupees(allocTotal)}
                      </div>
                      <div className={`rounded-md border p-2 text-xs ${Math.abs(allocationDiff) < 1 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                        <span className="text-muted-foreground">Remaining:</span> {formatRsFromRupees(allocationDiff)}
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

                {submitSuccess && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-700">
                      Deposit submitted in pending status. Treasurer has been notified for verification.
                    </p>
                  </div>
                )}

                <Button className="h-10 w-full sm:w-auto sm:self-end" disabled={!canSubmit} onClick={handleSubmit}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Submit
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 lg:self-start">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Landmark className="h-4 w-4 text-primary" />
                  Active Deposit Policies
                </CardTitle>
                <CardDescription>Current deposit policies</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {policiesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activePolicies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active deposit policies</p>
                ) : (
                  activePolicies.map((p) => (
                    <div key={p.policy_id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-lg font-bold">{formatRs(p.amount_paisa)}</p>
                        <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <p>Schedule: {p.schedule_type.replace(/_/g, " ")}</p>
                        <p>Due day: {p.due_day_of_month ?? "—"}</p>
                        <p>Late fine: {p.late_deposit_fine}%</p>
                        <p>Effective: {formatDate(p.effective_from)}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">My Deposits</CardTitle>
              <CardDescription>
                Your submitted deposits. Pending deposits can be withdrawn for editing and resubmission.
              </CardDescription>
            </CardHeader>
            <CardContent>{renderDepositTable(myDeposits, myLoading, false, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Community Deposits</CardTitle>
              <CardDescription>Verified deposits across the cooperative</CardDescription>
            </CardHeader>
            <CardContent>{renderDepositTable(communityDeposits, communityLoading, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">History</CardTitle>
              <CardDescription>Your verified/rejected deposit history</CardDescription>
            </CardHeader>
            <CardContent>{renderDepositTable(historyDeposits, historyLoading)}</CardContent>
          </Card>
        </TabsContent>

        {isTreasurer && (
          <TabsContent value="review" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Review Deposits</CardTitle>
                <CardDescription>Treasurer verification queue</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {reviewLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : reviewDeposits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending deposits to review.</p>
                ) : (
                  reviewDeposits.map((dep) => {
                    const isThisLoading = actionLoadingId === dep.id
                    return (
                      <div key={dep.id} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">{formatRsFromRupees(Number(dep.deposited_amount))}</p>
                            <p className="text-xs text-muted-foreground">Deposited: {formatDateTime(dep.deposited_date)}</p>
                            <p className="text-xs text-muted-foreground">User: {dep.user_id}</p>
                            {depositStatusBadge(dep.verification_status)}
                          </div>
                          <div className="flex items-center gap-2">
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
                              Verify
                            </Button>
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
                              Reject
                            </Button>
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
    </div>
  )
}
