import { useState, useRef } from "react"
import { Upload, FileText, CheckCircle2, Clock, X, Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { depositHistory } from "@/lib/data"
// TODO: Replace mock `depositHistory` with real API call once a GET /api/v1/deposits/my endpoint is available.
// Current backend has POST /deposits/ (create) and GET /deposits/{id} (single) but no list-my-deposits endpoint.
import { Textarea } from "@/components/ui/textarea"

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

export function DepositTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

        {/* Deposit Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Deposit Summary</CardTitle>
            <CardDescription>Your recent deposit activity</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg bg-accent/50 p-4">
              <p className="text-xs text-muted-foreground">Total Deposited (This Year)</p>
              <p className="font-nums mt-1 text-2xl font-bold text-foreground">{formatCurrency(2750)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">This Month</p>
                <p className="font-nums text-lg font-semibold text-foreground">{formatCurrency(500)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Last Month</p>
                <p className="font-nums text-lg font-semibold text-foreground">{formatCurrency(1250)}</p>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Pending Deposits</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-nums text-lg font-semibold text-foreground">{formatCurrency(500)}</p>
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning text-[10px]">
                  1 pending
                </Badge>
              </div>
            </div>
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
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Voucher</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-right text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depositHistory.map((dep) => (
                  <TableRow key={dep.id}>
                    <TableCell className="text-sm">{dep.date}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{dep.id}</TableCell>
                    <TableCell className="font-mono text-xs">{dep.voucherRef}</TableCell>
                    <TableCell className="text-sm">{dep.method}</TableCell>
                    <TableCell className="font-nums text-right text-sm font-medium">{formatCurrency(dep.amount)}</TableCell>
                    <TableCell>
                      {dep.status === "confirmed" ? (
                        <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Confirmed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning text-xs">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
