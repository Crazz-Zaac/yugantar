import { useState, useEffect, useRef, useCallback } from "react"
import { Upload, FileText, CheckCircle2, Clock, X, Plus, Landmark, Loader2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRs(paisa: number): string {
  const rupees = Math.round(Number(paisa) / 100)
  return `Rs. ${rupees.toLocaleString("en-IN")}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function DepositTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Active policies state
  const [activePolicies, setActivePolicies] = useState<DepositPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)

  const fetchActivePolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      const res = await apiClient.get("/policies/deposit")
      const active = (res.data as DepositPolicy[]).filter((p) => p.status === "active")
      setActivePolicies(active)
    } catch {
      // silently fail — policies just won't show
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivePolicies()
  }, [fetchActivePolicies])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Deposit Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Make a Deposit</CardTitle>
            <CardDescription>Upload your payment voucher to confirm your deposit</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount" className="text-xs font-medium">Amount</Label>
                <Input id="amount" type="number" placeholder="0.00" className="h-10" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="method" className="text-xs font-medium">Payment Method</Label>
                <Select>
                  <SelectTrigger id="method" className="h-10">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="mobile">Mobile Money</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="voucher-ref" className="text-xs font-medium">Voucher Reference</Label>
              <Input id="voucher-ref" placeholder="e.g. VCH-XXXX" className="h-10" />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium">Upload Voucher</Label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${isDragging
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
                  accept=".pdf,.jpg,.jpeg,.png"
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
                        setSelectedFile(null)
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
                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes" className="text-xs font-medium">Notes (optional)</Label>
              <Textarea id="notes" placeholder="Any additional notes..." className="min-h-[80px] resize-none" />
            </div>

            <Button className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto sm:self-end">
              <Plus className="mr-2 h-4 w-4" />
              Submit Deposit
            </Button>
          </CardContent>
        </Card>

        {/* Active Deposit Policies */}
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
