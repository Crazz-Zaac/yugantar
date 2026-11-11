import { useState, useEffect, useCallback } from "react"
import {
    Plus,
    AlertCircle,
    Landmark,
    CreditCard,
    Loader2,
    Info,
    ChevronDown,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { apiClient } from "@/api/api"
import { useAuth } from "@/contexts/AuthContext"
import PolicySigningDialog from "@/components/policies/PolicySigningDialog"
import ProxyRequestsPanel from "@/components/policies/ProxyRequestsPanel"
import { PolicyBoard } from "@/components/policies/PolicyBoard"
import type { SigningTarget } from "@/components/policies/signing"
import { fromZoneInputValue, nowZoneInputValue, toZoneInputValue, TIME_ZONE_LABEL } from "@/lib/datetime"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm/confirmContext"

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

// ─── Deposit Policy Form Defaults ────────────────────────────────────────────

const emptyDepositForm = {
    amount_paisa: "",
    late_deposit_fine: "",
    schedule_type: "monthly_fixed_day" as DepositScheduleType,
    due_day_of_month: "",
    allowed_months: "",
    max_occurrences: "",
    effective_from: nowZoneInputValue(),
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
    effective_from: nowZoneInputValue(),
    effective_to: "",
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MemberPoliciesTab() {
    const { user } = useAuth()

    // Role check: treasurer can manage policies
    const canManage = user?.cooperative_roles?.includes("treasurer")

    // Role check: president can approve draft policies
    // Office bearers authorise Admin proxy signatures for absent members
    const isOfficeBearer = ["president", "treasurer", "secretary"].some((r) => user?.cooperative_roles?.includes(r))

    // State
    const [depositPolicies, setDepositPolicies] = useState<DepositPolicy[]>([])
    const [loanPolicies, setLoanPolicies] = useState<LoanPolicy[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Dialogs
    const [depositDialogOpen, setDepositDialogOpen] = useState(false)
    const [loanDialogOpen, setLoanDialogOpen] = useState(false)
    const [editingDeposit, setEditingDeposit] = useState<DepositPolicy | null>(null)
    const [editingLoan, setEditingLoan] = useState<LoanPolicy | null>(null)
    const [depositForm, setDepositForm] = useState(emptyDepositForm)
    const [loanForm, setLoanForm] = useState(emptyLoanForm)
    const [submitting, setSubmitting] = useState(false)
    const confirm = useConfirm()
    const [signingTarget, setSigningTarget] = useState<SigningTarget | null>(null)
    const [boardReloadKey, setBoardReloadKey] = useState(0)
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
            setBoardReloadKey((k) => k + 1)
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
            amount_paisa: String(Math.round(p.amount_paisa / 100)),
            late_deposit_fine: String(p.late_deposit_fine),
            schedule_type: p.schedule_type,
            due_day_of_month: p.due_day_of_month != null ? String(p.due_day_of_month) : "",
            allowed_months: p.allowed_months != null ? String(p.allowed_months) : "",
            max_occurrences: p.max_occurrences != null ? String(p.max_occurrences) : "",
            effective_from: toZoneInputValue(p.effective_from),
            effective_to: toZoneInputValue(p.effective_to),
        })
        setDepositDialogOpen(true)
    }

    const submitDeposit = async () => {
        setSubmitting(true)
        try {
            const payload: Record<string, unknown> = {
                amount_paisa: Math.round(Number(depositForm.amount_paisa) * 100),
                late_deposit_fine: Number(depositForm.late_deposit_fine),
                schedule_type: depositForm.schedule_type,
                effective_from: depositForm.effective_from
                    ? fromZoneInputValue(depositForm.effective_from)
                    : undefined,
                effective_to: depositForm.effective_to
                    ? fromZoneInputValue(depositForm.effective_to)
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
            effective_from: toZoneInputValue(p.effective_from),
            effective_to: toZoneInputValue(p.effective_to),
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
                effective_from: loanForm.effective_from
                    ? fromZoneInputValue(loanForm.effective_from)
                    : undefined,
                effective_to: loanForm.effective_to
                    ? fromZoneInputValue(loanForm.effective_to)
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

    // ─── Sign & open for member signatures (Treasurer) ────────────────

    const openForSigning = async (type: "deposit" | "loan", policyId: string) => {
        const answer = await confirm({
            title: "Sign and open for signing?",
            description:
                "Your signature is recorded and every member is asked to sign within one week. The policy can't be edited unless you withdraw it.",
            confirmLabel: "Sign & open",
        })
        if (!answer.confirmed) return
        setSubmitting(true)
        try {
            await apiClient.post(`/policies/${type}/${policyId}/submit`)
            toast.success("Policy opened for signing", { description: "Members have one week to sign." })
            fetchPolicies()
        } catch {
            setError(`Failed to open the ${type} policy for signing.`)
        } finally {
            setSubmitting(false)
        }
    }

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
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Policies</h2>
                    <p className="text-sm text-muted-foreground">
                        {canManage
                            ? "Create cooperative deposit & loan policies and open them for member signatures"
                            : "View cooperative policies and sign the ones open for signing"}
                    </p>
                </div>
                {canManage && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Policy
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={openDepositCreate}>
                                <Landmark className="mr-2 h-4 w-4" />
                                Deposit Policy
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={openLoanCreate}>
                                <CreditCard className="mr-2 h-4 w-4" />
                                Loan Policy
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center gap-2 py-3">
                    <Info className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-primary">
                        {canManage
                            ? "New policies start as Draft. When ready, sign and open it for signing: members then have one week, and it takes effect only if every member has signed by the deadline. You can withdraw or revise it."
                            : "Each new policy is open for signing for one week and takes effect only if every member has signed by then. Use \"Review & sign\" to sign or reject it (you can change your decision until the deadline) and to see everyone's decisions."}
                    </p>
                </CardContent>
            </Card>

            {isOfficeBearer && <ProxyRequestsPanel mode="bearer" onChanged={fetchPolicies} />}

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

            <PolicyBoard
                deposit={depositPolicies}
                loan={loanPolicies}
                canManage={!!canManage}
                reloadKey={boardReloadKey}
                busy={submitting}
                onOpenSignatures={setSigningTarget}
                onOpenForSigning={openForSigning}
                onEdit={(item) =>
                    item.type === "deposit"
                        ? openDepositEdit(item.policy as DepositPolicy)
                        : openLoanEdit(item.policy as LoanPolicy)
                }
                onDelete={(type, id) => setDeleteConfirm({ type, id })}
            />

            {/* ═══════ DEPOSIT POLICY DIALOG ═══════ */}
            <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogContent className="max-w-2xl">
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
                                <Label className="text-xs font-medium">Amount (Rs)</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 500"
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
                                <Label className="text-xs font-medium">Effective From ({TIME_ZONE_LABEL})</Label>
                                <Input
                                    type="datetime-local"
                                    value={depositForm.effective_from}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, effective_from: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective To ({TIME_ZONE_LABEL})</Label>
                                <Input
                                    type="datetime-local"
                                    value={depositForm.effective_to}
                                    onChange={(e) => setDepositForm((f) => ({ ...f, effective_to: e.target.value }))}
                                />
                            </div>
                        </div>

                        {!editingDeposit && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Info className="h-3.5 w-3.5" />
                                Policy will be created as Draft. You can edit it and submit for President review when ready.
                            </p>
                        )}

                        <Button onClick={submitDeposit} disabled={submitting}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingDeposit ? "Update Policy" : "Create Policy"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ═══════ LOAN POLICY DIALOG ═══════ */}
            <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                <DialogContent className="max-w-2xl">
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
                                <Label className="text-xs font-medium">Min Loan Amount (Rs)</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 1000"
                                    value={loanForm.min_loan_amount}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, min_loan_amount: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Max Loan Amount (Rs)</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 100000"
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
                                <Label className="text-xs font-medium">Effective From ({TIME_ZONE_LABEL})</Label>
                                <Input
                                    type="datetime-local"
                                    value={loanForm.effective_from}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, effective_from: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Effective To ({TIME_ZONE_LABEL})</Label>
                                <Input
                                    type="datetime-local"
                                    value={loanForm.effective_to}
                                    onChange={(e) => setLoanForm((f) => ({ ...f, effective_to: e.target.value }))}
                                />
                            </div>
                        </div>

                        {!editingLoan && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Info className="h-3.5 w-3.5" />
                                Policy will be created as Draft. You can edit it and submit for President review when ready.
                            </p>
                        )}

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

            <PolicySigningDialog
                target={signingTarget}
                onClose={() => setSigningTarget(null)}
                onChanged={fetchPolicies}
                canWithdraw={!!canManage}
            />
        </div>
    )
}
