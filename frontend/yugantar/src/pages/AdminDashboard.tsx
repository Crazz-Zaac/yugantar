import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { useUser } from "@/contexts/UserContext";
import { RoleModal } from "@/components/RoleModal";
import type { UserForUI } from "@/utils/normalizeUser";
import type { AccessRole, CooperativeRole } from "@/constants";
import {
  Users,
  Shield,
  Activity,
  Settings,
  Lock,
  Trash2,
  Edit,
  MoreVertical,
  BadgeCheck,
  BadgeX,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const AdminSection = ({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <div className="bg-card border border-border rounded-lg p-6 space-y-4">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    </div>
    {children}
  </div>
);

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("users");
  const [selectedUser, setSelectedUser] = useState<UserForUI | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const { updateUserRoles } = useUser();

  const handleUpdateUserRoles = async (
    accessRoles: AccessRole[],
    cooperativeRoles: CooperativeRole[]
  ) => {
    if (!selectedUser) return;

    await updateUserRoles(selectedUser.id, accessRoles, cooperativeRoles);
  };

  const {
    users,
    totalUsers,
    loading,
    fetchUsers,
    deleteUser,
    toggleUserStatus,
  } = useUser();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");

  // Reset to page 1 when filters change
  useEffect(() => {
    fetchUsers((currentPage - 1) * pageSize, pageSize);
  }, [
    currentPage,
    searchTerm,
    roleFilter,
    statusFilter,
    verificationFilter,
    pageSize,
  ]);

  // Apply filters
  const filteredUsers = users.filter(user => {
    // Search filter (name or email)
    const matchesSearch =
      searchTerm === "" ||
      `${user.first_name} ${user.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    // Role filter
    const matchesRole =
      roleFilter === "all" ||
      user.access_roles.some(role => role === roleFilter);

    // Status filter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !user.disabled) ||
      (statusFilter === "inactive" && user.disabled);

    // Verification filter
    const matchesVerification =
      verificationFilter === "all" ||
      (verificationFilter === "verified" && user.is_verified) ||
      (verificationFilter === "unverified" && !user.is_verified);

    return matchesSearch && matchesRole && matchesStatus && matchesVerification;
  });

  // Pagination calculations
  const pageUsers = filteredUsers.length;
  const totalPages = Math.ceil(pageUsers / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  // Get unique roles for filter dropdown
  const uniqueRoles = Array.from(
    new Set(users.flatMap(user => user.access_roles))
  );

  return (
    <div className="min-h-screen bg-background">
      <Header showLogout onLogout={handleLogout} />

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground">
              Manage users, access roles, and cooperative settings
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 ${
                activeTab === "users"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Users className="h-4 w-4" /> User Management
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 ${
                activeTab === "roles"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Shield className="h-4 w-4" /> Role Management
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 ${
                activeTab === "activity"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Activity className="h-4 w-4" /> Activity Logs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 ${
                activeTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Settings className="h-4 w-4" /> System Settings
            </button>
          </div>

          {/* Users Tab */}
          {activeTab === "users" && (
            <AdminSection
              title="User Management"
              icon={<Users className="h-5 w-5 text-primary" />}
            >
              <div className="max-w-md rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <ul className="mt-2 space-y-1 text-left text-sm text-muted-foreground list-disc list-inside">
                  <li>View and manage all registered users</li>
                  <li>Activate, deactivate, or delete user accounts</li>
                  <li>Assign access roles and cooperative roles</li>
                </ul>
              </div>

              {/* Filters */}
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Filters:
                    </span>
                  </div>

                  {/* Role Filter */}
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Roles</option>
                    {uniqueRoles.map(role => (
                      <option key={role} value={role} className="capitalize">
                        {role}
                      </option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>

                  {/* Verification Filter */}
                  <select
                    value={verificationFilter}
                    onChange={e => setVerificationFilter(e.target.value)}
                    className="px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Verification</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                  </select>

                  {/* Page Size */}
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value={5}>5 per page</option>
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>

                  {/* Clear Filters */}
                  {(searchTerm ||
                    roleFilter !== "all" ||
                    statusFilter !== "all" ||
                    verificationFilter !== "all") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchTerm("");
                        setRoleFilter("all");
                        setStatusFilter("all");
                        setVerificationFilter("all");
                      }}
                      className="text-sm"
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Results Count */}
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, totalUsers)} of{" "}
                  {totalUsers} users
                  {(searchTerm ||
                    roleFilter !== "all" ||
                    statusFilter !== "all" ||
                    verificationFilter !== "all") &&
                    ` (filtered from ${users.length} total)`}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Name
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Email
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Access Role
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Cooperative Role
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Account Verification
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Account Status
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No users found matching your filters
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map(user => (
                        <tr
                          key={user.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            {user.first_name} {user.last_name}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {user.email}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {user.access_roles.map(role => (
                                <span
                                  key={role}
                                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary capitalize"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {user.cooperative_roles.map(role => (
                                <span
                                  key={role}
                                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary/10 text-secondary-foreground capitalize"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium">
                              {user.is_verified === true ? (
                                <>
                                  <BadgeCheck className="h-4 w-4 text-green-500" />
                                  <span className="text-green-600">
                                    Verified
                                  </span>
                                </>
                              ) : (
                                <>
                                  <BadgeX className="h-4 w-4 text-red-500" />
                                  <span className="text-red-600">
                                    Unverified
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                user.disabled
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-success/10 text-success"
                              }`}
                            >
                              {user.disabled ? "inactive" : "active"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                className="h-8 w-8 p-0 hover:bg-muted rounded flex items-center justify-center"
                                onClick={() => toggleUserStatus(user.id)}
                                title={
                                  user.disabled ? "Activate" : "Deactivate"
                                }
                              >
                                <Lock className="h-4 w-4" />
                              </button>

                              <button
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 rounded flex items-center justify-center"
                                onClick={() => deleteUser(user.id)}
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <Button
                                className="gap-2"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsRoleModalOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" /> Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="h-8 px-3"
                      >
                        First
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {/* Page Numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            // Show first page, last page, current page, and pages around current
                            return (
                              page === 1 ||
                              page === totalPages ||
                              (page >= currentPage - 1 &&
                                page <= currentPage + 1)
                            );
                          })
                          .map((page, index, array) => (
                            <>
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span
                                  key={`ellipsis-${page}`}
                                  className="px-2 text-muted-foreground"
                                >
                                  ...
                                </span>
                              )}
                              <Button
                                key={page}
                                variant={
                                  currentPage === page ? "default" : "outline"
                                }
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className="h-8 w-8 p-0"
                              >
                                {page}
                              </Button>
                            </>
                          ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="h-8 px-3"
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </AdminSection>
          )}

          {/* Roles Tab */}
          {activeTab === "roles" && (
            <AdminSection
              title="Role Management"
              icon={<Shield className="h-5 w-5 text-primary" />}
            >
              <p className="text-left text-sm text-muted-foreground mt-1 max-w-md">
                Assign member access roles and cooperative roles.
              </p>
              <div className="space-y-6">
                {/* Admin Role */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Admin</h3>
                    <Button className="gap-2">
                      <Edit className="h-4 w-4" /> Edit
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Full system access - manage users, roles, and settings
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      User Management
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      Role Assignment
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      Delete Users
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      System Settings
                    </span>
                  </div>
                </div>

                {/* Moderator Role */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Moderator</h3>
                    <Button className="gap-2">
                      <Edit className="h-4 w-4" /> Edit
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Limited administrative access - manage members and view
                    reports
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      View Users
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      View Reports
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      Send Notifications
                    </span>
                  </div>
                </div>

                {/* Member Role */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Member</h3>
                    <Button className="gap-2">
                      <Edit className="h-4 w-4" /> Edit
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Standard access - view personal data and transactions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      View Dashboard
                    </span>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs rounded">
                      View Transactions
                    </span>
                  </div>
                </div>
              </div>
            </AdminSection>
          )}

          {/* Activity Logs Tab */}
          {activeTab === "activity" && (
            <AdminSection
              title="Activity Logs"
              icon={<Activity className="h-5 w-5 text-primary" />}
            >
              <div className="space-y-3">
                {users.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-4 p-3 border border-border rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <p className="text-sm text-foreground flex-1">
                      {user.first_name} {user.last_name}{" "}
                      {user.disabled ? "was deactivated" : "logged in"} -{" "}
                      {user.joined_at}
                    </p>
                  </div>
                ))}
              </div>
            </AdminSection>
          )}
        </div>
      </main>
      {/* Role Modal */}
      <RoleModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSave={handleUpdateUserRoles}
      />
    </div>
  );
}
