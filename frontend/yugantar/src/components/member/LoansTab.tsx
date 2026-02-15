import { useState } from "react"
import { CreditCard, CheckCircle2, Clock, AlertTriangle, Send } from "lucide-react"
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
import { activeLoan, loanHistory, communityLoans } from "@/lib/data"
// TODO: Replace mock data imports above with real API calls once backend endpoints are available:
// - GET /api/v1/loans/active (activeLoan)
// - GET /api/v1/loans/history (loanHistory)
// - GET /api/v1/loans/community (communityLoans)
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function StatusBadge({ status }: { status: "current" | "completed" | "overdue" }) {
  if (status === "current") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Current
      </Badge>
    )
  }
  if (status === "completed") {
    return (
      <Badge variant="outline" className="gap-1 border-chart-2/30 bg-chart-2/10 text-chart-2 text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs">
      <AlertTriangle className="h-3 w-3" />
      Overdue
    </Badge>
  )
}

function LoanApplicationDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <CreditCard className="mr-2 h-4 w-4" />
          Apply for Loan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Loan Application</DialogTitle>
          <DialogDescription>
            Fill in the details below to apply for a cooperative loan. Approval typically takes 3-5 business days.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-amount" className="text-xs font-medium">Loan Amount</Label>
              <Input id="loan-amount" type="number" placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-term" className="text-xs font-medium">Term (months)</Label>
              <Select>
                <SelectTrigger id="loan-term">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="18">18 months</SelectItem>
                  <SelectItem value="24">24 months</SelectItem>
                  <SelectItem value="36">36 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="loan-purpose" className="text-xs font-medium">Purpose</Label>
            <Select>
              <SelectTrigger id="loan-purpose">
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business Expansion</SelectItem>
                <SelectItem value="agriculture">Agriculture</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="housing">Housing</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="loan-description" className="text-xs font-medium">Description</Label>
            <Textarea
              id="loan-description"
              placeholder="Describe how you plan to use the loan..."
              className="min-h-[80px] resize-none"
            />
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              Your maximum eligible loan amount is <strong className="text-foreground">$50,000</strong> based on a 3:1 loan-to-savings ratio.
              Standard interest rate: <strong className="text-foreground">8.5%</strong> per annum.
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(false)}>
            <Send className="mr-2 h-4 w-4" />
            Submit Application
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LoansTab() {
  const loanProgress = (activeLoan.totalPaid / activeLoan.amount) * 100

  return (
    <div className="flex flex-col gap-6">
      {/* Active Loan + Apply */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Loans</h2>
          <p className="text-sm text-muted-foreground">Manage your loans and view community lending activity</p>
        </div>
        <LoanApplicationDialog />
      </div>

      <Tabs defaultValue="my-loans" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="my-loans">My Loans</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="my-loans" className="mt-4 flex flex-col gap-6">
          {/* Current Active Loan Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Active Loan - {activeLoan.id}</CardTitle>
                  <CardDescription>{activeLoan.purpose}</CardDescription>
                </div>
                <StatusBadge status={activeLoan.status} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Loan Amount</p>
                  <p className="font-nums mt-1 text-xl font-bold text-foreground">{formatCurrency(activeLoan.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="font-nums mt-1 text-xl font-bold text-foreground">{formatCurrency(activeLoan.remaining)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest Rate</p>
                  <p className="font-nums mt-1 text-xl font-bold text-foreground">{activeLoan.interestRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Payment</p>
                  <p className="font-nums mt-1 text-xl font-bold text-foreground">{formatCurrency(activeLoan.monthlyPayment)}</p>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Repayment Progress</span>
                  <span className="font-nums font-medium text-foreground">{formatCurrency(activeLoan.totalPaid)} / {formatCurrency(activeLoan.amount)}</span>
                </div>
                <Progress value={loanProgress} className="h-2.5" />
              </div>
              <div className="mt-4 flex gap-6 text-xs text-muted-foreground">
                <span>Disbursed: {activeLoan.disbursedDate}</span>
                <span>Due: {activeLoan.dueDate}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Community Loans</CardTitle>
              <CardDescription>See who has taken loans from the cooperative</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Member</TableHead>
                      <TableHead className="text-xs">Purpose</TableHead>
                      <TableHead className="text-right text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Due Date</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {communityLoans.map((loan, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{loan.member}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{loan.purpose}</TableCell>
                        <TableCell className="font-nums text-right text-sm font-medium">{formatCurrency(loan.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{loan.dueDate}</TableCell>
                        <TableCell><StatusBadge status={loan.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Loan History</CardTitle>
              <CardDescription>Your past completed loans</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Loan ID</TableHead>
                      <TableHead className="text-xs">Purpose</TableHead>
                      <TableHead className="text-right text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Disbursed</TableHead>
                      <TableHead className="text-xs">Completed</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loanHistory.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-mono text-xs">{loan.id}</TableCell>
                        <TableCell className="text-sm">{loan.purpose}</TableCell>
                        <TableCell className="font-nums text-right text-sm font-medium">{formatCurrency(loan.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{loan.disbursedDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{loan.completedDate}</TableCell>
                        <TableCell><StatusBadge status={loan.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
