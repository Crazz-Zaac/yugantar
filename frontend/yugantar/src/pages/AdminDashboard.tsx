import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import {
  Users,
  Shield,
  Activity,
  Settings,
  Lock,
  LogOut,
  Menu,
  X,
  Trash2,
  // Edit,
  Edit,
  Eye,
  MoreVertical,
  AlertCircle,
  FlaskRound,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "moderator";
  cooperativeRole: "chairman" | "secretary" | "treasurer" | "member";
  joinDate: string;
  status: "active" | "inactive";
  lastActivity: string;
}

const mockUsers: User[] = [
  {
    id: "1",
    name: "Rajesh Kumar",
    email: "rajesh@example.com",
    role: "admin",
    cooperativeRole: "chairman",
    joinDate: "2023-01-15",
    status: "active",
    lastActivity: "2 minutes ago",
  },
  {
    id: "2",
    name: "Priya Sharma",
    email: "priya@example.com",
    role: "moderator",
    cooperativeRole: "treasurer",
    joinDate: "2023-02-20",
    status: "active",
    lastActivity: "1 hour ago",
  },
  {
    id: "3",
    name: "Amit Patel",
    email: "amit@example.com",
    role: "member",
    cooperativeRole: "member",
    joinDate: "2023-03-10",
    status: "active",
    lastActivity: "3 hours ago",
  },
  {
    id: "4",
    name: "Neha Singh",
    email: "neha@example.com",
    role: "member",
    cooperativeRole: "member",
    joinDate: "2023-04-05",
    status: "inactive",
    lastActivity: "5 days ago",
  },
];

const AdminSection = ({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <div className="bg-card border border-border rounded-lg p-6 space-y-4">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 bg-primary/10 rounded-lg">{Icon}</div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    </div>
    {children}
  </div>
);

export default function Admin() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("users");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [users, setUsers] = useState<User[]>(mockUsers);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const deleteUser = (id: string) => {
    setUsers(users.filter(user => user.id !== id));
  };

  const toggleUserStatus = (id: string) => {
    setUsers(
      users.map(user =>
        user.id === id
          ? {
              ...user,
              status: user.status === "active" ? "inactive" : "active",
            }
          : user
      )
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showLogout={true} onLogout={handleLogout} />

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground">
              Manage users, roles, and cooperative settings
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 rounded-none px-4 py-2 font-medium border-b-2 ${
                activeTab === "users"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Users className="h-4 w-4 mr-2" />
              User Management
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`flex items-center gap-2 rounded-none px-4 py-2 font-medium border-b-2 ${
                activeTab === "roles"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Shield className="h-4 w-4 mr-2" />
              Role Management
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`flex items-center gap-2 rounded-none px-4 py-2 font-medium border-b-2 ${
                activeTab === "activity"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Activity className="h-4 w-4 mr-2" />
              Activity Logs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 rounded-none px-4 py-2 font-medium border-b-2 ${
                activeTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-transparent"
              }`}
            >
              <Settings className="h-4 w-4 mr-2" />
              System Settings
            </button>
          </div>

          {/* Content */}
          {activeTab === "users" && (
            <AdminSection
              title="User Management"
              icon={<Users className="h-5 w-5 text-primary" />}
            >
              <div className="space-y-4">
                {/* User List */}
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
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">
                          Last Activity
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {users.map(user => (
                        <tr
                          key={user.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4 text-foreground">
                            {user.name}
                          </td>

                          <td className="py-3 px-4 text-muted-foreground">
                            {user.email}
                          </td>

                          {/* Access Role */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                              {user.role}
                            </span>
                          </td>

                          {/* Cooperative Role */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary/10 text-secondary-foreground">
                              {user.cooperativeRole}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                user.status === "active"
                                  ? "bg-success/10 text-success"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {user.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-muted-foreground">
                            {user.lastActivity}
                          </td>

                          {/* Actions (left-aligned now) */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                className="h-8 w-8 p-0"
                                onClick={() => toggleUserStatus(user.id)}
                                title={
                                  user.status === "active"
                                    ? "Deactivate"
                                    : "Activate"
                                }
                              >
                                <Lock className="h-4 w-4" />
                              </button>

                              <button
                                className="h-8 w-8 p-0 text-accent hover:text-accent/80"
                                onClick={() => deleteUser(user.id)}
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>

                              <button className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </AdminSection>
          )}

          {activeTab === "roles" && (
            <AdminSection
              title="Role Management"
              icon={<Shield className="h-5 w-5 text-primary" />}
            >
              <div className="space-y-6">
                {/* Admin Role */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Admin</h3>
                    <button className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
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
                    <button className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
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
                    <button className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
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

          {activeTab === "activity" && (
            <AdminSection
              title="Activity Logs"
              icon={<Activity className="h-5 w-5 text-primary" />}
            >
              <div className="space-y-3">
                {[
                  "Rajesh Kumar logged in - 2 minutes ago",
                  "Priya Sharma created new loan request - 1 hour ago",
                  "Amit Patel made deposit of ₹5,000 - 3 hours ago",
                  "System backup completed - 1 day ago",
                  "Neha Singh account deactivated - 5 days ago",
                  "New member Vikram Singh registered - 1 week ago",
                  "Interest calculated for all accounts - 2 weeks ago",
                ].map((log, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 border border-border rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <p className="text-sm text-foreground flex-1">{log}</p>
                  </div>
                ))}
              </div>
            </AdminSection>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <AdminSection
                title="General Settings"
                icon={<Settings className="h-5 w-5 text-primary" />}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Cooperative Name
                      </label>
                      <input
                        type="text"
                        value="ABC Wealth Management"
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Registration Number
                      </label>
                      <input
                        type="text"
                        value="ABC-2023-001"
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                        readOnly
                      />
                    </div>
                  </div>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90 px-6">
                    Save Changes
                  </Button>
                </div>
              </AdminSection>

              <AdminSection
                title="Cooperative Roles"
                icon={<Shield className="h-5 w-5 text-primary" />}
              >
                <div className="space-y-3">
                  {["Chairman", "Secretary", "Treasurer", "Member"].map(
                    role => (
                      <div
                        key={role}
                        className="flex items-center justify-between p-3 border border-border rounded hover:bg-muted/50"
                      >
                        <span className="text-foreground font-medium">
                          {role}
                        </span>
                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                          Assign
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </AdminSection>

              <AdminSection
                title="Security Settings"
                icon={<Lock className="h-5 w-5 text-primary" />}
              >
                <div className="space-y-4">
                  <label className="flex items-center gap-3 p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-foreground">
                      Enable two-factor authentication
                    </span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-foreground">
                      Require password reset on first login
                    </span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-foreground">
                      Log all admin activities
                    </span>
                  </label>
                </div>
              </AdminSection>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
