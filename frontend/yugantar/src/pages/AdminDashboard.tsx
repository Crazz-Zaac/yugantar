import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Users,
  Shield,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  Trash2,
  Edit,
  Eye,
  AlertCircle
} from "lucide-react";
import { UserForUI } from "@/utils/normalizeUser";

// Helper function to check if user is admin
const isAdmin = (user: UserForUI | null): boolean => {
  if (!user) return false;
  return user.access_roles.split(",").includes("admin");
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Check if user is admin
  if (!isAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 border border-gray-200 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">You don't have permission to access the admin dashboard.</p>
          <Button
            onClick={() => setLocation("/dashboard")}
            className="bg-[#274add] hover:bg-[#062497] text-white"
          >
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const adminUsers = [
    { id: 1, name: "John Doe", email: "john@cooperative.com", role: "admin", status: "active", joinDate: "2024-01-15" },
    { id: 2, name: "Jane Smith", email: "jane@cooperative.com", role: "member", status: "active", joinDate: "2024-02-20" },
    { id: 3, name: "Mike Johnson", email: "mike@cooperative.com", role: "member", status: "active", joinDate: "2024-03-10" },
    { id: 4, name: "Sarah Wilson", email: "sarah@cooperative.com", role: "moderator", status: "inactive", joinDate: "2024-01-05" },
    { id: 5, name: "Tom Brown", email: "tom@cooperative.com", role: "member", status: "active", joinDate: "2024-04-01" }
  ];

  const activityLog = [
    { id: 1, user: "Jane Smith", action: "Deposited $500", timestamp: "2 hours ago", type: "deposit" },
    { id: 2, user: "Mike Johnson", action: "Requested loan of $2,000", timestamp: "5 hours ago", type: "loan" },
    { id: 3, user: "Sarah Wilson", action: "Updated profile information", timestamp: "1 day ago", type: "profile" },
    { id: 4, user: "Tom Brown", action: "Withdrew $300", timestamp: "2 days ago", type: "withdrawal" },
    { id: 5, user: "John Doe", action: "Generated monthly report", timestamp: "3 days ago", type: "report" }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#274add] to-[#062497] flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-lg text-gray-900 hidden sm:inline">Admin Panel</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.first_name}</p>
              <p className="text-xs text-gray-600 font-semibold text-[#274add]">Administrator</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:relative w-64 h-[calc(100vh-73px)] bg-white border-r border-gray-200 transition-transform duration-300 z-30 overflow-y-auto`}
        >
          <nav className="p-4 space-y-2">
            {[
              { id: "overview", label: "Overview", icon: Shield },
              { id: "users", label: "User Management", icon: Users },
              { id: "activity", label: "User Activity", icon: Activity },
              { id: "roles", label: "Role Assignment", icon: Shield },
              { id: "settings", label: "Admin Settings", icon: Settings }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === item.id
                    ? "bg-[#274add] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-600 mt-2">Manage cooperative members, roles, and system settings</p>
              </div>

              {/* Admin Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Total Users", value: "850", color: "#274add" },
                  { label: "Active Sessions", value: "234", color: "#2c804c" },
                  { label: "Pending Approvals", value: "12", color: "#e33400" },
                  { label: "System Health", value: "99.8%", color: "#ffd900" }
                ].map((stat, i) => (
                  <Card key={i} className="p-6 border border-gray-200">
                    <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                  </Card>
                ))}
              </div>

              {/* Quick Actions */}
              <Card className="p-6 border border-gray-200">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button className="bg-[#274add] hover:bg-[#062497] text-white">
                    Add New User
                  </Button>
                  <Button variant="outline" className="border-[#274add] text-[#274add]">
                    Generate Report
                  </Button>
                  <Button variant="outline" className="border-[#274add] text-[#274add]">
                    System Backup
                  </Button>
                  <Button variant="outline" className="border-[#274add] text-[#274add]">
                    View Logs
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                <Button className="bg-[#274add] hover:bg-[#062497] text-white">
                  + Add User
                </Button>
              </div>

              <Card className="p-6 border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Role</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Join Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => (
                        <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{u.name}</td>
                          <td className="py-3 px-4 text-gray-600">{u.email}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                u.status === "active"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{u.joinDate}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button className="p-2 hover:bg-gray-200 rounded-lg text-gray-600 hover:text-gray-900">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button className="p-2 hover:bg-gray-200 rounded-lg text-gray-600 hover:text-gray-900">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button className="p-2 hover:bg-red-100 rounded-lg text-gray-600 hover:text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">User Activity Log</h2>

              <Card className="p-6 border border-gray-200">
                <div className="space-y-4">
                  {activityLog.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-b-0">
                      <div className="w-10 h-10 rounded-full bg-[#274add]/10 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-[#274add]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{log.user}</p>
                        <p className="text-sm text-gray-600">{log.action}</p>
                        <p className="text-xs text-gray-500 mt-1">{log.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "roles" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">Role Assignment</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { name: "Admin", description: "Full system access", members: 2 },
                  { name: "Moderator", description: "Manage members and approvals", members: 5 },
                  { name: "Member", description: "Standard member access", members: 843 }
                ].map((role, i) => (
                  <Card key={i} className="p-6 border border-gray-200">
                    <h3 className="font-bold text-lg text-gray-900 mb-2">{role.name}</h3>
                    <p className="text-sm text-gray-600 mb-4">{role.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-[#274add]">{role.members}</span>
                      <Button variant="outline" size="sm" className="border-[#274add] text-[#274add]">
                        Manage
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">Admin Settings</h2>

              <Card className="p-6 border border-gray-200">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-4">System Configuration</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Cooperative Name
                        </label>
                        <input
                          type="text"
                          defaultValue="Cooperative Financial Platform"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#274add] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Admin Email
                        </label>
                        <input
                          type="email"
                          defaultValue="admin@cooperative.com"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#274add] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" defaultChecked className="w-4 h-4" />
                          <span className="text-sm font-medium text-gray-700">Enable new member approvals</span>
                        </label>
                      </div>
                      <div>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" defaultChecked className="w-4 h-4" />
                          <span className="text-sm font-medium text-gray-700">Enable two-factor authentication</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <Button className="bg-[#274add] hover:bg-[#062497] text-white">
                      Save Settings
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}