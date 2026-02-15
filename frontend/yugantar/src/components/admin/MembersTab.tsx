import { useState, useEffect } from "react"
import { Search, MoreHorizontal, UserPlus, CheckCircle2, XCircle, AlertTriangle, Loader2, Shield } from "lucide-react"
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
  disabled: boolean
  joined_at: string
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase()
}

function getFullName(m: MemberUser) {
  return `${m.first_name} ${m.last_name}`.trim()
}

function getMemberStatus(m: MemberUser): "active" | "inactive" | "suspended" {
  if (m.disabled) return "suspended"
  if (!m.is_verified) return "inactive"
  return "active"
}

function MemberStatusBadge({ status }: { status: "active" | "inactive" | "suspended" }) {
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
        Inactive
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
    try {
      await apiClient.post(`/admin/users/${memberId}/toggle-disabled`)
      fetchMembers() // Refresh the list
    } catch (err) {
      console.error("Failed to toggle member status:", err)
    }
  }

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
          <p className="text-sm text-muted-foreground">Manage cooperative members and their accounts</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">All Members</CardTitle>
              <CardDescription>{filtered.length} of {totalCount} members</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-64 pl-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
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
            <div className="overflow-x-auto">
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
                          {new Date(member.joined_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.phone || "-"}</TableCell>
                        <TableCell><MemberStatusBadge status={status} /></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${getFullName(member)}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Profile</DropdownMenuItem>
                              <DropdownMenuItem>Edit Details</DropdownMenuItem>
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
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
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
