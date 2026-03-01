import { useState, useEffect, useRef, useCallback } from "react"
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  Plus,
  Landmark,
  Loader2,
  AlertCircle,
  Info,
  ScanLine,
  CalendarClock,
  IndianRupee,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Receipt,
  Minus,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiClient } from "@/api/api"

// ─── Types ───────────────────────────────────────────────────────────────────

type PolicyStatus = "draft" | "finalized" | "active" | "expired" | "void"
type DepositScheduleType = "monthly_fixed_day" | "occasional"

interface DepositPolicy {
  policy_id: string
  amount_paisa: number
  late_deposit_fine: number
  schedule_type: DepositScheduleType
  due_day_of_month: number | null
  allowed_months: number | null
  max_occurrences: number | null
  status: PolicyStatus
  effective_from: string
  effective_to: string | null
}

interface OcrResult {
  amount: number | null
  charge: number | null
  date: string | null
  reference: string | null
}

type SplitCategory = "deposit" | "fine" | "advance" | "loan_principal" | "loan_interest" | "loan_renewal"

interface SplitAllocation {
  category: SplitCategory
  label: string
  amount_rupees: number
  loan_id: string | null
  editable: boolean
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
  allocations: SplitAllocation[]
  active_loans: LoanSummary[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRs(paisa: number): string {
  const rupees = Math.round(Number(paisa) / 100)
  return `Rs. ${rupees.toLocaleString("en-IN")}`
}

function formatRsFromRupees(rupees: number): string {
  return `Rs. ${Math.round(rupees).toLocaleString("en-IN")}`
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

/** Calculate the next due date based on a policy's due_day_of_month */
function calculateDueDate(policy: DepositPolicy): string {
  if (!policy.due_day_of_month) return "—"
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()

  if (now.getDate() > policy.due_day_of_month) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(policy.due_day_of_month, lastDay)

  return new Date(year, month, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Polling interval for OCR task status
const OCR_POLL_INTERVAL = 2000

export function DepositTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Active policies state
  const [activePolicies, setActivePolicies] = useState<DepositPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)

  // Form state
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Editable allocations (user can adjust the split)
  const [allocations, setAllocations] = useState<SplitAllocation[]>([])

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Derived
  const selectedPolicy = activePolicies.find((p) => p.policy_id === selectedPolicyId) ?? null

  // ─── Fetch active policies ──────────────────────────────────────────────

  const fetchActivePolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      const res = await apiClient.get("/policies/deposit")
      const active = (res.data as DepositPolicy[]).filter((p) => p.status === "active")
      setActivePolicies(active)
      if (active.length === 1) {
        setSelectedPolicyId(active[0].policy_id)
      }
    } catch {
      // silently fail
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivePolicies()
  }, [fetchActivePolicies])

  // ─── File upload & OCR ──────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const processOcr = async (file: File) => {
    setOcrLoading(true)
    setOcrError(null)
    setOcrResult(null)
    setPreview(null)
    setAllocations([])
    setSubmitSuccess(false)

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
        } else if (data.status === "failed") {
          throw new Error(data.message || "OCR processing failed")
        } else {
          await new Promise((r) => setTimeout(r, OCR_POLL_INTERVAL))
          return poll()
        }
      }

      const result = await poll()
      setOcrResult(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OCR processing failed"
      setOcrError(msg)
    } finally {
      setOcrLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setSelectedFile(file)
      processOcr(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      processOcr(file)
    }
  }

  const clearFile = () => {
    setSelectedFile(null)
    setOcrResult(null)
    setOcrError(null)
    setPreview(null)
    setAllocations([])
    setSubmitSuccess(false)
  }

  // ─── Preview (after OCR completes + policy is selected) ─────────────────

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
      setPreview(data)
      setAllocations(data.allocations)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to compute deposit preview"
      setPreviewError(msg)
    } finally {
      setPreviewLoading(false)
    }
  }, [ocrResult, selectedPolicyId])

  // Auto-fetch preview when OCR completes and policy is selected
  useEffect(() => {
    if (ocrResult && ocrResult.amount != null && selectedPolicyId) {
      fetchPreview()
    }
  }, [ocrResult, selectedPolicyId, fetchPreview])

  // ─── Allocation editing ─────────────────────────────────────────────────

  const updateAllocation = (index: number, newAmount: number) => {
    setAllocations((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], amount_rupees: newAmount }
      return next
    })
  }

  const addLoanAllocation = (category: SplitCategory, loan: LoanSummary) => {
    setAllocations((prev) => {
      // Check if this allocation already exists
      const existingIdx = prev.findIndex(
        (a) => a.category === category && a.loan_id === loan.loan_id
      )
      if (existingIdx >= 0) return prev

      let label = ""
      let defaultAmount = 0
      switch (category) {
        case "loan_principal":
          label = `Loan Principal (${formatRs(loan.principal_paisa)})`
          break
        case "loan_interest":
          label = `Loan Interest (${formatRs(loan.accrued_interest_paisa)})`
          break
        case "loan_renewal":
          label = `Loan Renewal — Pay Off (${formatRs(loan.outstanding_principal_paisa)})`
          defaultAmount = Math.round(loan.outstanding_principal_paisa / 100)
          break
        default:
          label = category
      }

      const next = [...prev]
      // If adding loan_renewal, reduce advance by the default amount
      if (category === "loan_renewal" && defaultAmount > 0) {
        const advIdx = next.findIndex((a) => a.category === "advance")
        if (advIdx >= 0) {
          const available = next[advIdx].amount_rupees
          const transferAmt = Math.min(available, defaultAmount)
          next[advIdx] = { ...next[advIdx], amount_rupees: available - transferAmt }
          defaultAmount = transferAmt
        }
      }

      next.push({
        category,
        label,
        amount_rupees: defaultAmount,
        loan_id: loan.loan_id,
        editable: true,
      })
      return next
    })
  }

  const removeLoanAllocation = (index: number) => {
    setAllocations((prev) => {
      const removed = prev[index]
      const next = prev.filter((_, i) => i !== index)
      // Add the removed amount back to advance
      const advIdx = next.findIndex((a) => a.category === "advance")
      if (advIdx >= 0 && removed.amount_rupees > 0) {
        next[advIdx] = {
          ...next[advIdx],
          amount_rupees: next[advIdx].amount_rupees + removed.amount_rupees,
        }
      }
      return next
    })
  }

  // Compute allocation totals
  const allocTotal = allocations.reduce((sum, a) => sum + a.amount_rupees, 0)
  const netAmount = preview ? preview.net_amount : 0
  const allocationDiff = netAmount - allocTotal

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!preview || !ocrResult || !selectedPolicyId) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const payload = {
        policy_id: selectedPolicyId,
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

      // Reset form after success
      setTimeout(() => {
        clearFile()
        setSubmitSuccess(false)
      }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit deposit"
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Can submit? ────────────────────────────────────────────────────────

  const canSubmit =
    !!preview &&
    !preview.is_insufficient &&
    !submitting &&
    !previewLoading &&
    Math.abs(allocationDiff) < 1

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ═══════ Deposit Form ═══════ */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Make a Deposit</CardTitle>
            <CardDescription>Select a policy, upload your payment voucher, review the breakdown, and submit</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* ── Step 1: Select Policy ── */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium">Select Deposit Policy</Label>
              {policiesLoading ? (
                <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading policies...</span>
                </div>
              ) : activePolicies.length === 0 ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-dashed px-3">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">No active deposit policies available</span>
                </div>
              ) : activePolicies.length === 1 ? (
                <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                  <Landmark className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{formatRs(activePolicies[0].amount_paisa)}</span>
                  <span className="text-xs text-muted-foreground">
                    · {activePolicies[0].schedule_type.replace(/_/g, " ")}
                    {activePolicies[0].due_day_of_month ? ` · Due day ${activePolicies[0].due_day_of_month}` : ""}
                  </span>
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

            {/* ── Policy-derived read-only fields ── */}
            {selectedPolicy && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Amount to be Deposited</Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                    <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm font-semibold">{formatRs(selectedPolicy.amount_paisa)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Set by the deposit policy — cannot be changed</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Due Deposit Date</Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{calculateDueDate(selectedPolicy)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Next due date based on policy schedule</p>
                </div>
              </div>
            )}

            {/* ── Step 2: Upload Voucher ── */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium">Upload Payment Voucher</Label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                  onChange={handleFileSelect}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-success" />
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="font-nums text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
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
                    <p className="text-sm font-medium text-foreground">
                      Drop your voucher here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">JPG, PNG up to 10MB — OCR will extract details automatically</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── OCR Status ── */}
            {ocrLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-primary">Processing voucher…</p>
                  <p className="text-xs text-muted-foreground">OCR is extracting deposit details from your image</p>
                </div>
              </div>
            )}

            {ocrError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{ocrError}</p>
              </div>
            )}

            {/* ── OCR-extracted fields ── */}
            {ocrResult && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Voucher Details (OCR)</p>
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
                  {ocrResult.charge != null && ocrResult.charge > 0 && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-medium text-muted-foreground">Bank Charge</Label>
                      <div className="flex h-10 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 dark:border-orange-800/40 dark:bg-orange-950/20">
                        <Minus className="h-3.5 w-3.5 text-orange-600" />
                        <span className="font-mono text-sm font-semibold text-orange-700 dark:text-orange-400">
                          {formatRsFromRupees(ocrResult.charge)}
                        </span>
                      </div>
                    </div>
                  )}
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
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3" />
                  Extracted from the voucher image — cannot be edited
                </p>
              </div>
            )}

            {/* ── Preview loading ── */}
            {previewLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm font-medium text-primary">Computing deposit breakdown…</p>
              </div>
            )}

            {previewError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{previewError}</p>
              </div>
            )}

            {/* ═══════ Step 3: Deposit Breakdown & Smart Split ═══════ */}
            {preview && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Deposit Breakdown</p>
                </div>

                {/* Summary row */}
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border bg-background p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Amount</p>
                    <p className="font-mono text-sm font-bold">{formatRsFromRupees(preview.net_amount)}</p>
                  </div>
                  <div className="rounded-md border bg-background p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Required</p>
                    <p className="font-mono text-sm font-bold">{formatRsFromRupees(preview.required_deposit)}</p>
                  </div>
                  {preview.is_late && (
                    <div className="rounded-md border border-orange-200 bg-orange-50 p-2 text-center dark:border-orange-800/40 dark:bg-orange-950/30">
                      <p className="text-[10px] uppercase tracking-wider text-orange-600">Fine ({preview.fine_percentage}%)</p>
                      <p className="font-mono text-sm font-bold text-orange-700 dark:text-orange-400">{formatRsFromRupees(preview.fine_amount)}</p>
                    </div>
                  )}
                  <div className={`rounded-md border p-2 text-center ${preview.excess_amount > 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30"
                    : preview.is_insufficient
                      ? "border-destructive/30 bg-destructive/5"
                      : "bg-background"
                    }`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {preview.is_insufficient ? "Shortfall" : "Excess"}
                    </p>
                    <p className={`font-mono text-sm font-bold ${preview.is_insufficient ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {preview.is_insufficient
                        ? `- ${formatRsFromRupees(Math.abs(preview.net_amount - preview.required_deposit - preview.fine_amount))}`
                        : formatRsFromRupees(preview.excess_amount)}
                    </p>
                  </div>
                </div>

                {/* Late warning */}
                {preview.is_late && (
                  <div className="mb-4 flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800/40 dark:bg-orange-950/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                    <div>
                      <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Late Deposit</p>
                      <p className="text-xs text-orange-700/80 dark:text-orange-400/80">
                        The deposit date is past the due date ({formatDateTime(preview.due_date)}).
                        A fine of {formatRsFromRupees(preview.fine_amount)} ({preview.fine_percentage}%) will be deducted.
                      </p>
                    </div>
                  </div>
                )}

                {/* Insufficient warning */}
                {preview.is_insufficient && (
                  <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Insufficient Amount</p>
                      <p className="text-xs text-destructive/80">
                        The deposited amount (after bank charge deduction) is not enough to cover
                        the required deposit{preview.is_late ? " and late fine" : ""}.
                        Please deposit more to proceed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Allocations */}
                {!preview.is_insufficient && (
                  <>
                    <Separator className="my-3" />
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Allocations
                    </p>
                    <div className="flex flex-col gap-2">
                      {allocations.map((alloc, idx) => (
                        <div
                          key={`${alloc.category}-${alloc.loan_id ?? idx}`}
                          className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${alloc.category === "deposit"
                                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-950/30 dark:text-blue-300"
                                  : alloc.category === "fine"
                                    ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300"
                                    : alloc.category === "advance"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                                      : alloc.category === "loan_renewal"
                                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300"
                                        : "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800/40 dark:bg-purple-950/30 dark:text-purple-300"
                                  }`}
                              >
                                {alloc.category === "deposit" && "Deposit"}
                                {alloc.category === "fine" && "Fine"}
                                {alloc.category === "advance" && "Advance"}
                                {alloc.category === "loan_principal" && "Loan Principal"}
                                {alloc.category === "loan_interest" && "Loan Interest"}
                                {alloc.category === "loan_renewal" && "Loan Renewal"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{alloc.label}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {alloc.editable ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Rs.</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="h-8 w-24 font-mono text-sm"
                                  value={alloc.amount_rupees}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0
                                    updateAllocation(idx, val)
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="font-mono text-sm font-semibold">
                                {formatRsFromRupees(alloc.amount_rupees)}
                              </span>
                            )}
                            {/* Remove button for loan allocations */}
                            {(alloc.category === "loan_principal" || alloc.category === "loan_interest" || alloc.category === "loan_renewal") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => removeLoanAllocation(idx)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Allocation total check */}
                      {Math.abs(allocationDiff) >= 1 && (
                        <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 p-2 dark:border-orange-800/40 dark:bg-orange-950/20">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                          <span className="text-xs text-orange-700 dark:text-orange-400">
                            Allocations {allocationDiff > 0 ? `are short by ${formatRsFromRupees(allocationDiff)}` : `exceed net amount by ${formatRsFromRupees(Math.abs(allocationDiff))}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Loan split options */}
                    {preview.active_loans.length > 0 && preview.excess_amount > 0 && (
                      <>
                        <Separator className="my-3" />
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Allocate Excess to Loan Payments
                        </p>
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          You have active loans. Reduce the advance deposit and allocate towards loan repayment.
                        </p>
                        <div className="flex flex-col gap-2">
                          {preview.active_loans.map((loan) => (
                            <div key={loan.loan_id} className="rounded-md border bg-background p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-medium">
                                    Loan · {formatRs(loan.principal_paisa)}
                                    <span className="ml-2 text-muted-foreground">@ {loan.interest_rate}%</span>
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Outstanding: {formatRs(loan.outstanding_principal_paisa)} principal
                                    {loan.outstanding_interest_paisa > 0 && ` · ${formatRs(loan.outstanding_interest_paisa)} interest`}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {loan.outstanding_principal_paisa > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => addLoanAllocation("loan_principal", loan)}
                                    disabled={allocations.some(
                                      (a) => a.category === "loan_principal" && a.loan_id === loan.loan_id
                                    )}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Only Loan Payment
                                  </Button>
                                )}
                                {loan.outstanding_interest_paisa > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => addLoanAllocation("loan_interest", loan)}
                                    disabled={allocations.some(
                                      (a) => a.category === "loan_interest" && a.loan_id === loan.loan_id
                                    )}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Only Interest
                                  </Button>
                                )}
                                {loan.outstanding_principal_paisa > 0 && loan.outstanding_interest_paisa > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => {
                                      addLoanAllocation("loan_principal", loan)
                                      // Small delay so state updates before adding the second
                                      setTimeout(() => addLoanAllocation("loan_interest", loan), 0)
                                    }}
                                    disabled={
                                      allocations.some((a) => a.category === "loan_principal" && a.loan_id === loan.loan_id) &&
                                      allocations.some((a) => a.category === "loan_interest" && a.loan_id === loan.loan_id)
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                    Loan + Interest
                                  </Button>
                                )}
                                {loan.outstanding_principal_paisa > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800/40 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                    onClick={() => addLoanAllocation("loan_renewal", loan)}
                                    disabled={allocations.some(
                                      (a) => a.category === "loan_renewal" && a.loan_id === loan.loan_id
                                    )}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Loan Renewal
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Submit error / success ── */}
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            {submitSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/40 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Deposit submitted successfully!
                </p>
              </div>
            )}

            {/* ── Submit button ── */}
            <Button
              className="h-10 w-full sm:w-auto sm:self-end"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Submit Deposit
            </Button>
          </CardContent>
        </Card>

        {/* ═══════ Active Deposit Policies ═══════ */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Landmark className="h-4 w-4 text-primary" />
              Active Deposit Policies
            </CardTitle>
            <CardDescription>Current policies governing deposits</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {policiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activePolicies.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertCircle className="h-5 w-5 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No active deposit policies</p>
              </div>
            ) : (
              activePolicies.map((p) => (
                <div key={p.policy_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-lg font-bold text-foreground">{formatRs(p.amount_paisa)}</p>
                    <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-xs text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Schedule</span>
                      <p className="mt-0.5 font-medium capitalize text-foreground">{p.schedule_type.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Due Day</span>
                      <p className="mt-0.5 font-medium text-foreground">{p.due_day_of_month ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Late Fine</span>
                      <p className="mt-0.5 font-medium text-foreground">{p.late_deposit_fine}%</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Effective</span>
                      <p className="mt-0.5 font-medium text-foreground">{formatDate(p.effective_from)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Deposit History Table ═══════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Deposit History</CardTitle>
          <CardDescription>All your past deposits and their statuses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No deposit records yet. Submit a deposit above to get started.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
