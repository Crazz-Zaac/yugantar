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
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  let month = now.getMonth() // 0-indexed

  // If we're past the due day this month, use next month
  if (now.getDate() > policy.due_day_of_month) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  // Clamp day to last day of that month
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(policy.due_day_of_month, lastDay)

  return new Date(year, month, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// ─── Polling interval for OCR task status ────────────────────────────────────
const OCR_POLL_INTERVAL = 2000 // ms

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

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Derived
  const selectedPolicy = activePolicies.find((p) => p.policy_id === selectedPolicyId) ?? null

  // ─── Fetch active policies ──────────────────────────────────────────────

  const fetchActivePolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      const res = await apiClient.get("/policies/deposit")
      const active = (res.data as DepositPolicy[]).filter((p) => p.status === "active")
      setActivePolicies(active)
      // Auto-select if only one
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

    try {
      const formData = new FormData()
      formData.append("file", file)

      // Upload file for OCR
      const uploadRes = await apiClient.post("/v1/ocr/process-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      const taskId = uploadRes.data.task_id

      // Poll for result
      const poll = async (): Promise<OcrResult> => {
        const statusRes = await apiClient.get(`/v1/ocr/task-status/${taskId}`)
        const data = statusRes.data

        if (data.status === "completed") {
          // Task result is wrapped: { status: "success", data: { amount, date, ... } }
          const taskResult = data.result
          return (taskResult?.data ?? taskResult) as OcrResult
        } else if (data.status === "failed") {
          throw new Error(data.message || "OCR processing failed")
        } else {
          // still processing — wait and retry
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
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ═══════ Deposit Form ═══════ */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Make a Deposit</CardTitle>
            <CardDescription>Select a policy, upload your payment voucher, and submit</CardDescription>
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

            {/* ── OCR-extracted read-only fields ── */}
            {ocrResult && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Extracted from Voucher (OCR)</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  {ocrResult.reference && (
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <Label className="text-xs font-medium text-muted-foreground">Transaction Reference</Label>
                      <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3">
                        <span className="font-mono text-sm">{ocrResult.reference}</span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3" />
                  These values are extracted from the voucher and cannot be edited
                </p>
              </div>
            )}

            {/* ── Submit error ── */}
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            {/* ── Submit button ── */}
            <Button
              className="h-10 w-full sm:w-auto sm:self-end"
              disabled={!selectedPolicy || !ocrResult || ocrLoading || submitting}
              onClick={async () => {
                if (!selectedPolicy || !ocrResult) return
                setSubmitting(true)
                setSubmitError(null)
                try {
                  // TODO: wire to actual deposit creation endpoint when ready
                  // await apiClient.post("/deposits/deposit", { ... })
                  alert("Deposit submitted successfully! (API integration pending)")
                } catch {
                  setSubmitError("Failed to submit deposit. Please try again.")
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Submit Deposit
            </Button>
          </CardContent>
        </Card>        {/* Active Deposit Policies */}
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

      {/* Deposit History Table */}
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
