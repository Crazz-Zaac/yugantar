import { useState, useEffect } from "react"
import { Search, MoreHorizontal, CheckCircle2, XCircle, AlertTriangle, Loader2, Shield, Clock, UserCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { apiClient } from "@/api/api"
import { RoleModal } from "@/components/RoleModal"
import { UserForUI } from "@/utils/normalizeUser"
import type { AccessRole, CooperativeRole } from "@/constants"
import { formatDate } from "@/lib/datetime"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm/confirmContext"

interface MemberUser {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  email: string
  phone: string
  address: string
  gender: string
  date_of_birth: string | null
  access_roles: string[]
  cooperative_roles: string[]
  is_verified: boolean
  is_approved: boolean
  disabled: boolean
  joined_at: string
}

type MemberStatus = "active" | "pending" | "inactive" | "suspended"

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase()
}

function getFullName(m: MemberUser) {
  return `${m.first_name} ${m.last_name}`.trim()
}

function getMemberStatus(m: MemberUser): MemberStatus {
  if (m.disabled) return "suspended"
  if (!m.is_approved) return "pending"
  if (!m.is_verified) return "inactive"
  return "active"
}

function MemberStatusBadge({ status }: { status: MemberStatus }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning text-xs">
        <Clock className="h-3 w-3" />
        Pending approval
      </Badge>
    )
  }
  if (status === "active") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </Badge>
    )
  }
  if (status === "inactive") {
    return (
      <Badge variant="outline" className="gap-1 border-muted-foreground/30 bg-muted text-muted-foreground text-xs">
        <XCircle className="h-3 w-3" />
        Email unverified
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs">
      <AlertTriangle className="h-3 w-3" />
      Suspended
    </Badge>
  )
}

export function MembersTab() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [members, setMembers] = useState<MemberUser[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [roleModalUser, setRoleModalUser] = useState<UserForUI | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setIsLoading(true)
    setError("")
    try {
      const res = await apiClient.get("/admin/users", { params: { limit: 100, skip: 0 } })
      setMembers(res.data.users)
      setTotalCount(res.data.total)
    } catch (err: any) {
      console.error("Failed to fetch members:", err)
      setError(err?.response?.data?.detail || "Failed to load members")
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleDisabled = async (memberId: string) => {
    const member = members.find((m) => m.id === memberId)
    if (member && !member.disabled) {
      const answer = await confirm({
        title: `Suspend ${getFullName(member)}?`,
        description: "They're signed out everywhere and can't sign in until you reactivate the account.",
        confirmLabel: "Suspend",
        destructive: true,
      })
      if (!answer.confirmed) return
    }
    try {
      await apiClient.post(`/admin/users/${memberId}/toggle-disabled`)
      toast.success(member?.disabled ? "Account reactivated" : "Account suspended")
      fetchMembers() // Refresh the list
    } catch (err) {
      console.error("Failed to toggle member status:", err)
    }
  }

  // New registrations: approve (they can sign in once their email is verified)
  // or reject (the account is removed and they're told by email)
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null)
  const handleApproval = async (member: MemberUser, approve: boolean) => {
    if (!approve) {
      const answer = await confirm({
        title: `Reject ${getFullName(member)}'s registration?`,
        description: "Their account will be removed and they'll be told by email.",
        confirmLabel: "Reject registration",
        destructive: true,
      })
      if (!answer.confirmed) return
    }
    setApprovalBusyId(member.id)
    try {
      await apiClient.post(`/admin/users/${member.id}/${approve ? "approve" : "reject"}`)
      toast.success(approve ? `${getFullName(member)} approved` : "Registration rejected", {
        description: approve
          ? member.is_verified
            ? "They can sign in now."
            : "They can sign in once they verify their email."
          : "They've been told by email.",
      })
      fetchMembers()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || `Failed to ${approve ? "approve" : "reject"} the registration`)
    } finally {
      setApprovalBusyId(null)
    }
  }
  const pendingApproval = members.filter((m) => !m.is_approved && !m.disabled)

  const renderActions = (member: MemberUser, status: MemberStatus) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${getFullName(member)}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* <DropdownMenuItem>View Profile</DropdownMenuItem>
            <DropdownMenuItem>Edit Details</DropdownMenuItem> */}
            <DropdownMenuItem onClick={() => setRoleModalUser(member as unknown as UserForUI)}>
              <Shield className="mr-2 h-3.5 w-3.5" />
              Edit Roles
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {status === "suspended" ? (
              <DropdownMenuItem className="text-success" onClick={() => handleToggleDisabled(member.id)}>
                Reactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-destructive" onClick={() => handleToggleDisabled(member.id)}>
                Suspend
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
  )

  const handleRoleSave = async (accessRoles: AccessRole[], cooperativeRoles: CooperativeRole[]) => {
    if (!roleModalUser) return
    await apiClient.patch(`/admin/users/${roleModalUser.id}`, {
      access_roles: accessRoles,
      cooperative_roles: cooperativeRoles,
    })
    fetchMembers() // Refresh the list after role update
  }

  const filtered = members.filter((m) => {
    const fullName = getFullName(m).toLowerCase()
    const query = searchQuery.toLowerCase()
    const matchesSearch = fullName.includes(query) ||
      m.id.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    const status = getMemberStatus(m)
    const matchesStatus = statusFilter === "all" || status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground">New members register themselves; approve them here, and manage roles and accounts.</p>
        </div>
      </div>

      {pendingApproval.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4" />
              Registrations awaiting approval ({pendingApproval.length})
            </CardTitle>
            <CardDescription>
              New members can sign in only after verifying their email and being approved here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pendingApproval.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{getFullName(m)}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · {m.phone || "no phone"} · registered {formatDate(m.joined_at)}
                  </p>
                  <p className={`text-xs ${m.is_verified ? "text-success" : "text-muted-foreground"}`}>
                    {m.is_verified ? "Email verified" : "Email not verified yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={approvalBusyId === m.id} onClick={() => handleApproval(m, true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={approvalBusyId === m.id}
                    onClick={() => handleApproval(m, false)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">All Members</CardTitle>
              <CardDescription>{filtered.length} of {totalCount} members</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full pl-9 text-sm sm:w-64"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending approval</SelectItem>
                  <SelectItem value="inactive">Email unverified</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading members...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchMembers}>Retry</Button>
            </div>
          ) : (
            <>
            <ul className="flex flex-col divide-y sm:hidden">
              {filtered.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">No members match.</li>}
              {filtered.map((member) => {
                const status = getMemberStatus(member)
                return (
                  <li key={member.id} className="flex items-start gap-3 py-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                        {getInitials(member.first_name, member.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{getFullName(member)}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <MemberStatusBadge status={status} />
                        {member.cooperative_roles.filter((r) => r !== "member").map((role) => (
                          <Badge key={role} variant="outline" className="border-primary/30 text-[10px] capitalize text-primary">{role}</Badge>
                        ))}
                        {member.access_roles.filter((r) => r !== "user").map((role) => (
                          <Badge key={role} variant="secondary" className="text-[10px] capitalize">{role}</Badge>
                        ))}
                      </div>
                    </div>
                    {renderActions(member, status)}
                  </li>
                )
              })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Member</TableHead>
                    <TableHead className="text-xs">Roles</TableHead>
                    <TableHead className="text-xs">Join Date</TableHead>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="w-10 text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((member) => {
                    const status = getMemberStatus(member)
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                                {getInitials(member.first_name, member.last_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{getFullName(member)}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {member.access_roles.map((role) => (
                              <Badge key={`access-${role}`} variant="secondary" className="text-[10px]">{role}</Badge>
                            ))}
                            {member.cooperative_roles.map((role) => (
                              <Badge key={`coop-${role}`} variant="outline" className="text-[10px] border-primary/30 text-primary">{role}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(member.joined_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.phone || "-"}</TableCell>
                        <TableCell><MemberStatusBadge status={status} /></TableCell>
                        <TableCell>
                          {renderActions(member, status)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <RoleModal
        isOpen={!!roleModalUser}
        onClose={() => setRoleModalUser(null)}
        user={roleModalUser}
        onSave={handleRoleSave}
      />
    </div>
  )
}
