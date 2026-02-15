import { useState, useEffect, useCallback } from "react"
import {
    Plus,
    Pencil,
    Trash2,
    CheckCircle2,
    Clock,
    FileX,
    AlertCircle,
    Search,
    Landmark,
    CreditCard,
    Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { apiClient } from "@/api/api"
import { useAuth } from "@/contexts/AuthContext"

// ─── Types ───────────────────────────────────────────────────────────────────

type PolicyStatus = "draft" | "active" | "expired" | "void"
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
    created_by: string | null
    created_at: string
    updated_by: string | null
    updated_at: string | null
}

interface LoanPolicy {
    policy_id: string
    version: number
    max_loan_amount: number
    min_loan_amount: number
    interest_rate: number
    grace_period_days: number | null
    max_renewals: number | null
    requires_collateral: boolean
    status: PolicyStatus
    emi_applicable: boolean
    effective_from: string
    effective_to: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusConfig: Record<PolicyStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
    active: {
        label: "Active",
        icon: CheckCircle2,
        className: "border-success/30 bg-success/10 text-success",
    },
    draft: {
        label: "Draft",
        icon: Clock,
        className: "border-warning/30 bg-warning/10 text-warning",
    },
    expired: {
        label: "Expired",
        icon: FileX,
        className: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
    },
    void: {
        label: "Void",
        icon: AlertCircle,
        className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
}

function StatusBadge({ status }: { status: PolicyStatus }) {
    const cfg = statusConfig[status]
    const Icon = cfg.icon
    return (
        <Badge variant="outline" className={`gap-1 text-xs ${cfg.className}`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
        </Badge>
    )
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
}

function formatAmount(paisa: number): string {
    const rupees = Number(paisa) / 100
    return `Rs. ${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
}

function formatDecimalAmount(amount: number): string {
    return `Rs. ${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
}

// ─── Deposit Policy Form Defaults ────────────────────────────────────────────

const emptyDepositForm = {
    amount_paisa: "",
    late_deposit_fine: "",
    schedule_type: "monthly_fixed_day" as DepositScheduleType,
    due_day_of_month: "",
    allowed_months: "",
    max_occurrences: "",
    status: "draft" as PolicyStatus,
    effective_from: new Date().toISOString().slice(0, 16),
    effective_to: "",
}

const emptyLoanForm = {
    max_loan_amount: "",
    min_loan_amount: "",
    interest_rate: "",
    grace_period_days: "0",
    max_renewals: "0",
    requires_collateral: false,
    emi_applicable: false,
    status: "draft" as PolicyStatus,
    effective_from: new Date().toISOString().slice(0, 16),
    effective_to: "",
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MemberPoliciesTab() {
    const { user } = useAuth()

    // Role check: treasurer + moderator can manage policies
    const canManage =
        user?.cooperative_roles?.includes("treasurer") &&
        user?.access_roles?.includes("moderator")

    // State
    const [depositPolicies, setDepositPolicies] = useState<DepositPolicy[]>([])
    const [loanPolicies, setLoanPolicies] = useState<LoanPolicy[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")

    // Dialogs
    const [depositDialogOpen, setDepositDialogOpen] = useState(false)
    const [loanDialogOpen, setLoanDialogOpen] = useState(false)
    const [editingDeposit, setEditingDeposit] = useState<DepositPolicy | null>(null)
    const [editingLoan, setEditingLoan] = useState<LoanPolicy | null>(null)
    const [depositForm, setDepositForm] = useState(emptyDepositForm)
    const [loanForm, setLoanForm] = useState(emptyLoanForm)
    const [submitting, setSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: "deposit" | "loan"; id: string } | null>(null)

    // Fetch
    const fetchPolicies = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [depRes, loanRes] = await Promise.all([
                apiClient.get("/policies/deposit"),
                apiClient.get("/policies/loan"),
            ])
            setDepositPolicies(depRes.data)
            setLoanPolicies(loanRes.data)
        } catch {
            setError("Failed to load policies. Please try again.")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPolicies()
    }, [fetchPolicies])

    // ─── Deposit CRUD ────────────────────────────────────────────────────────

    const openDepositCreate = () => {
        setEditingDeposit(null)
        setDepositForm(emptyDepositForm)
        setDepositDialogOpen(true)
    }

    const openDepositEdit = (p: DepositPolicy) => {
        setEditingDeposit(p)
        setDepositForm({
            amount_paisa: String(p.amount_paisa),
            late_deposit_fine: String(p.late_deposit_fine),
            schedule_type: p.schedule_type,
            due_day_of_month: p.due_day_of_month != null ? String(p.due_day_of_month) : "",
            allowed_months: p.allowed_months != null ? String(p.allowed_months) : "",
            max_occurrences: p.max_occurrences != null ? String(p.max_occurrences) : "",
            status: p.status,
            effective_from: p.effective_from ? p.effective_from.slice(0, 16) : "",
            effective_to: p.effective_to ? p.effective_to.slice(0, 16) : "",
        })
        setDepositDialogOpen(true)
    }

    const submitDeposit = async () => {
        setSubmitting(true)
        try {
            const payload: Record<string, unknown> = {
                amount_paisa: Number(depositForm.amount_paisa),
                late_deposit_fine: Number(depositForm.late_deposit_fine),
                schedule_type: depositForm.schedule_type,
                status: depositForm.status,
                effective_from: depositForm.effective_from
                    ? new Date(depositForm.effective_from).toISOString()
                    : undefined,
                effective_to: depositForm.effective_to
                    ? new Date(depositForm.effective_to).toISOString()
                    : null,
            }
            if (depositForm.due_day_of_month)
                payload.due_day_of_month = Number(depositForm.due_day_of_month)
            if (depositForm.allowed_months)
                payload.allowed_months = Number(depositForm.allowed_months)
            if (depositForm.max_occurrences)
                payload.max_occurrences = Number(depositForm.max_occurrences)

            if (editingDeposit) {
                await apiClient.put(`/policies/deposit/${editingDeposit.policy_id}`, {
                    ...payload,
                    change_reason: "Policy updated via dashboard",
                })
            } else {
                await apiClient.post("/policies/deposit", payload)
            }
            setDepositDialogOpen(false)
            fetchPolicies()
        } catch {
            setError("Failed to save deposit policy.")
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Loan CRUD ───────────────────────────────────────────────────────────

    const openLoanCreate = () => {
        setEditingLoan(null)
        setLoanForm(emptyLoanForm)
        setLoanDialogOpen(true)
    }

    const openLoanEdit = (p: LoanPolicy) => {
        setEditingLoan(p)
        setLoanForm({
            max_loan_amount: String(p.max_loan_amount),
            min_loan_amount: String(p.min_loan_amount),
            interest_rate: String(p.interest_rate),
            grace_period_days: String(p.grace_period_days ?? 0),
            max_renewals: String(p.max_renewals ?? 0),
            requires_collateral: p.requires_collateral,
            emi_applicable: p.emi_applicable,
            status: p.status,
            effective_from: p.effective_from ? p.effective_from.slice(0, 16) : "",
            effective_to: p.effective_to ? p.effective_to.slice(0, 16) : "",
        })
        setLoanDialogOpen(true)
    }

    const submitLoan = async () => {
        setSubmitting(true)
        try {
            const payload: Record<string, unknown> = {
                max_loan_amount: Number(loanForm.max_loan_amount),
                min_loan_amount: Number(loanForm.min_loan_amount),
                interest_rate: Number(loanForm.interest_rate),
                grace_period_days: Number(loanForm.grace_period_days),
                max_renewals: Number(loanForm.max_renewals),
                requires_collateral: loanForm.requires_collateral,
                emi_applicable: loanForm.emi_applicable,
                status: loanForm.status,
                effective_from: loanForm.effective_from
                    ? new Date(loanForm.effective_from).toISOString()
                    : undefined,
                effective_to: loanForm.effective_to
                    ? new Date(loanForm.effective_to).toISOString()
                    : null,
            }

            if (editingLoan) {
                await apiClient.put(`/policies/loan/${editingLoan.policy_id}`, {
                    ...payload,
                    change_reason: "Policy updated via dashboard",
                })
            } else {
                await apiClient.post("/policies/loan", payload)
            }
            setLoanDialogOpen(false)
            fetchPolicies()
        } catch {
            setError("Failed to save loan policy.")
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Delete ──────────────────────────────────────────────────────────────

    const confirmDelete = async () => {
        if (!deleteConfirm) return
        setSubmitting(true)
        try {
            await apiClient.delete(`/policies/${deleteConfirm.type}/${deleteConfirm.id}`)
            setDeleteConfirm(null)
            fetchPolicies()
        } catch {
            setError(
                `Failed to delete ${deleteConfirm.type} policy. Active policies and policies that have taken effect cannot be deleted.`
            )
            setDeleteConfirm(null)
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Counts ──────────────────────────────────────────────────────────────

    const depositActive = depositPolicies.filter((p) => p.status === "active").length
    const depositDraft = depositPolicies.filter((p) => p.status === "draft").length
    const loanActive = loanPolicies.filter((p) => p.status === "active").length
    const loanDraft = loanPolicies.filter((p) => p.status === "draft").length

    // ─── Render ──────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading policies...</span>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-foreground">Policies</h2>
                <p className="text-sm text-muted-foreground">
                    {canManage
                        ? "View and manage cooperative deposit & loan policies"
                        : "View cooperative deposit & loan policies"}
                </p>
            </div>

            {error && (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="flex items-center gap-2 py-3">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
                            Dismiss
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card>
                    <CardContent className="flex flex-col items-center p-4">
                        <Landmark className="mb-1 h-5 w-5 text-primary" />
                        <p className="font-nums text-xl font-bold text-foreground">{depositPolicies.length}</p>
                        <p className="text-xs text-muted-foreground">Deposit Policies</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex flex-col items-center p-4">
                        <CheckCircle2 className="mb-1 h-5 w-5 text-success" />
                        <p className="font-nums text-xl font-bold text-foreground">{depositActive}</p>
                        <p className="text-xs text-muted-foreground">Active Deposit</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex flex-col items-center p-4">
                        <CreditCard className="mb-1 h-5 w-5 text-primary" />
                        <p className="font-nums text-xl font-bold text-foreground">{loanPolicies.length}</p>
                        <p className="text-xs text-muted-foreground">Loan Policies</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex flex-col items-center p-4">
                        <CheckCircle2 className="mb-1 h-5 w-5 text-success" />
                        <p className="font-nums text-xl font-bold text-foreground">{loanActive}</p>
                        <p className="text-xs text-muted-foreground">Active Loan</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs for Deposit / Loan */}
            <Tabs defaultValue="deposit" className="w-full">
                <TabsList>
                    <TabsTrigger value="deposit">
                        <Landmark className="mr-2 h-4 w-4" />
                        Deposit Policies
                    </TabsTrigger>
                    <TabsTrigger value="loan">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Loan Policies
                    </TabsTrigger>
                </TabsList>

                {/* ═══════ DEPOSIT POLICIES TAB ═══════ */}
                <TabsContent value="deposit" className="mt-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-sm font-semibold">Deposit Policies</CardTitle>
                                    <CardDescription>
                                        {depositPolicies.length} total · {depositActive} active · {depositDraft} draft
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="h-9 w-48 pl-9 text-sm"
                                        />
                                    </div>
                                    {canManage && (
                                        <Button size="sm" onClick={openDepositCreate}>
                                            <Plus className="mr-1.5 h-4 w-4" />
                                            Add
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">Amount (Rs)</TableHead>
                                            <TableHead className="text-xs">Late Fine %</TableHead>
                                            <TableHead className="text-xs">Schedule</TableHead>
                                            <TableHead className="text-xs">Due Day</TableHead>
                                            <TableHead className="text-xs">Effective From</TableHead>
                                            <TableHead className="text-xs">Effective To</TableHead>
                                            <TableHead className="text-xs">Status</TableHead>
                                            {canManage && <TableHead className="w-20 text-xs">Actions</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {depositPolicies.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-sm text-muted-foreground">
                                                    No deposit policies found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            depositPolicies
                                                .filter((p) => {
                                                    if (!searchQuery) return true
                                                    const q = searchQuery.toLowerCase()
                                                    return (
                                                        p.schedule_type.toLowerCase().includes(q) ||
                                                        p.status.toLowerCase().includes(q) ||
                                                        formatAmount(p.amount_paisa).toLowerCase().includes(q)
                                                    )
                                                })
                                                .map((p) => (
                                                    <TableRow key={p.policy_id}>
                                                        <TableCell className="font-mono text-sm font-semibold">
                                                            {formatAmount(p.amount_paisa)}
                                                        </TableCell>
                                                        <TableCell className="text-sm">{p.late_deposit_fine}%</TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary" className="text-xs capitalize">
                                                                {p.schedule_type.replace(/_/g, " ")}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm">
                                                            {p.due_day_of_month ?? "—"}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {formatDate(p.effective_from)}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {formatDate(p.effective_to)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <StatusBadge status={p.status} />
                                                        </TableCell>
                                                        {canManage && (
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => openDepositEdit(p)}
                                                                        aria-label="Edit"
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                                        onClick={() => setDeleteConfirm({ type: "deposit", id: p.policy_id })}
                                                                        aria-label="Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ═══════ LOAN POLICIES TAB ═══════ */}
                <TabsContent value="loan" className="mt-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-sm font-semibold">Loan Policies</CardTitle>
                                    <CardDescription>
                                        {loanPolicies.length} total · {loanActive} active · {loanDraft} draft
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="h-9 w-48 pl-9 text-sm"
                                        />
                                    </div>
                                    {canManage && (
                                        <Button size="sm" onClick={openLoanCreate}>
                                            <Plus className="mr-1.5 h-4 w-4" />
                                            Add
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">Loan Range</TableHead>
                                            <TableHead className="text-xs">Interest %</TableHead>
                                            <TableHead className="text-xs">Grace Days</TableHead>
                                            <TableHead className="text-xs">Max Renewals</TableHead>
                                            <TableHead className="text-xs">Collateral</TableHead>
                                            <TableHead className="text-xs">EMI</TableHead>
                                            <TableHead className="text-xs">Effective</TableHead>
                                            <TableHead className="text-xs">Status</TableHead>
                                            {canManage && <TableHead className="w-20 text-xs">Actions</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loanPolicies.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                                                    No loan policies found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            loanPolicies
                                                .filter((p) => {
                                                    if (!searchQuery) return true
                                                    const q = searchQuery.toLowerCase()
                                                    return (
                                                        p.status.toLowerCase().includes(q) ||
                                                        formatDecimalAmount(p.min_loan_amount).toLowerCase().includes(q) ||
                                                        formatDecimalAmount(p.max_loan_amount).toLowerCase().includes(q)
                                                    )
                                                })
                                                .map((p) => (
                                                    <TableRow key={p.policy_id}>
                                                        <TableCell className="text-sm">
                                                            <span className="font-mono font-semibold">
                                                                {formatDecimalAmount(p.min_loan_amount)}
                                                            </span>
                                                            <span className="mx-1 text-muted-foreground">–</span>
                                                            <span className="font-mono font-semibold">
                                                                {formatDecimalAmount(p.max_loan_amount)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-sm font-semibold">
                                                            {Number(p.interest_rate)}%
                                                        </TableCell>
                                                        <TableCell className="text-sm">{p.grace_period_days ?? 0}</TableCell>
                                                        <TableCell className="text-sm">{p.max_renewals ?? 0}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={p.requires_collateral ? "default" : "secondary"} className="text-xs">
                                                                {p.requires_collateral ? "Required" : "No"}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={p.emi_applicable ? "default" : "secondary"} className="text-xs">
                                                                {p.emi_applicable ? "Yes" : "No"}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {formatDate(p.effective_from)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <StatusBadge status={p.status} />
                                                        </TableCell>
                                                        {canManage && (
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => openLoanEdit(p)}
                                                                        aria-label="Edit"
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                                        onClick={() => setDeleteConfirm({ type: "loan", id: p.policy_id })}
                                                                        aria-label="Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ═══════ DEPOSIT POLICY DIALOG ═══════ */}
            <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingDeposit ? "Edit Deposit Policy" : "Create Deposit Policy"}</DialogTitle>
                        <DialogDescription>
                            {editingDeposit
                                ? "Update the deposit policy details below"
                                : "Fill in the details to create a new deposit policy"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Amount (paisa)</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 10000"
                                    value={depositForm.amount_paisa}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, amount_paisa: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Late Fine (%)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 2.5"
                                    value={depositForm.late_deposit_fine}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, late_deposit_fine: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Schedule Type</Label>
                                <Select
                                    value={depositForm.schedule_type}
                                    onValueChange={(v) =>
                                        setDepositForm((f) => ({ ...f, schedule_type: v as DepositScheduleType }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly_fixed_day">Monthly Fixed Day</SelectItem>
                                        <SelectItem value="occasional">Occasional</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Due Day of Month</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    placeholder="1-31"
                                    value={depositForm.due_day_of_month}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, due_day_of_month: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Allowed Months</Label>
                                <Input
                                    type="number"
                                    placeholder="Optional"
                                    value={depositForm.allowed_months}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, allowed_months: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Max Occurrences</Label>
                                <Input
                                    type="number"
                                    placeholder="Optional"
                                    value={depositForm.max_occurrences}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, max_occurrences: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Status</Label>
                                <Select
                                    value={depositForm.status}
                                    onValueChange={(v) => setDepositForm((f) => ({ ...f, status: v as PolicyStatus }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="expired">Expired</SelectItem>
                                        <SelectItem value="void">Void</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective From</Label>
                                <Input
                                    type="datetime-local"
                                    value={depositForm.effective_from}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, effective_from: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective To</Label>
                                <Input
                                    type="datetime-local"
                                    value={depositForm.effective_to}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, effective_to: e.target.value }))}
                                />
                            </div>
                        </div>

                        <Button onClick={submitDeposit} disabled={submitting}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingDeposit ? "Update Policy" : "Create Policy"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ═══════ LOAN POLICY DIALOG ═══════ */}
            <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingLoan ? "Edit Loan Policy" : "Create Loan Policy"}</DialogTitle>
                        <DialogDescription>
                            {editingLoan
                                ? "Update the loan policy details below"
                                : "Fill in the details to create a new loan policy"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Min Loan Amount</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 1000.00"
                                    value={loanForm.min_loan_amount}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, min_loan_amount: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Max Loan Amount</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 100000.00"
                                    value={loanForm.max_loan_amount}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, max_loan_amount: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Interest Rate (%)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 12.00"
                                    value={loanForm.interest_rate}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, interest_rate: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Grace Period (days)</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 15"
                                    value={loanForm.grace_period_days}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, grace_period_days: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Max Renewals</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 3"
                                    value={loanForm.max_renewals}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, max_renewals: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Status</Label>
                                <Select
                                    value={loanForm.status}
                                    onValueChange={(v) => setLoanForm((f) => ({ ...f, status: v as PolicyStatus }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="expired">Expired</SelectItem>
                                        <SelectItem value="void">Void</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={loanForm.requires_collateral}
                                    onCheckedChange={(v) => setLoanForm((f) => ({ ...f, requires_collateral: v }))}
                                />
                                <Label className="text-xs font-medium">Requires Collateral</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={loanForm.emi_applicable}
                                    onCheckedChange={(v) => setLoanForm((f) => ({ ...f, emi_applicable: v }))}
                                />
                                <Label className="text-xs font-medium">EMI Applicable</Label>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective From</Label>
                                <Input
                                    type="datetime-local"
                                    value={loanForm.effective_from}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, effective_from: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective To</Label>
                                <Input
                                    type="datetime-local"
                                    value={loanForm.effective_to}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, effective_to: e.target.value }))}
                                />
                            </div>
                        </div>

                        <Button onClick={submitLoan} disabled={submitting}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingLoan ? "Update Policy" : "Create Policy"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ═══════ DELETE CONFIRMATION DIALOG ═══════ */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Policy</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this {deleteConfirm?.type} policy? This action cannot
                            be undone. Note: active policies and policies that have taken effect cannot be deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={submitting}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
