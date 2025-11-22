import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Moon,
  Sun,
  Calendar,
  DollarSign
} from "lucide-react";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, message: "Loan repayment due in 5 days", read: false },
    { id: 2, message: "Interest credited to your account", read: true },
    { id: 3, message: "New deposit received", read: true }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Personal KPIs
  const personalKpis = [
    {
      title: "Total Deposit",
      value: "$5,250.00",
      change: "+$500 this month",
      icon: Wallet,
      color: "#2c804c",
      bgColor: "#e8f5f0"
    },
    {
      title: "Active Loan",
      value: "$12,000.00",
      change: "Loan ID: LN-2024-001",
      icon: DollarSign,
      color: "#e33400",
      bgColor: "#ffe8e0"
    },
    {
      title: "Next Repayment Date",
      value: "Dec 15, 2024",
      change: "Amount: $1,200.00",
      icon: Calendar,
      color: "#274add",
      bgColor: "#e8f0ff"
    },
    {
      title: "Interest Rate",
      value: "8.5% p.a.",
      change: "Fixed rate",
      icon: TrendingUp,
      color: "#c3252c",
      bgColor: "#ffe8e8"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#274add] to-[#062497] flex items-center justify-center">
                <span className="text-white font-bold text-sm">ABC</span>
              </div>
              <span className="font-bold text-lg text-gray-900 dark:text-white hidden sm:inline">ABC Wealth</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-600 dark:text-gray-400">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                            !notif.read ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                        >
                          <p className="text-sm text-gray-900 dark:text-white font-medium">
                            {notif.message}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Night Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>

            {/* User Info and Logout */}
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
          } lg:translate-x-0 fixed lg:relative w-64 h-[calc(100vh-73px)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300 z-30 overflow-y-auto`}
        >
          <nav className="p-4 space-y-2">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "members", label: "Members", icon: Users },
              { id: "deposits", label: "Deposits", icon: Wallet },
              { id: "loans", label: "Loans", icon: TrendingUp },
              { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
              { id: "settings", label: "Settings", icon: Settings }
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
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
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
              {/* Welcome Section */}
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome back, {user?.name}!</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">Here's your personal financial overview</p>
              </div>

              {/* Personal KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {personalKpis.map((kpi, i) => (
                  <Card
                    key={i}
                    className="p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{kpi.title}</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{kpi.value}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{kpi.change}</span>
                        </div>
                      </div>
                      <div
                        className="p-3 rounded-lg"
                        style={{ backgroundColor: kpi.bgColor }}
                      >
                        <kpi.icon
                          className="w-6 h-6"
                          style={{ color: kpi.color }}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Quick Actions */}
              <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button className="bg-[#274add] hover:bg-[#062497] text-white">
                    Make Deposit
                  </Button>
                  <Button className="bg-[#2c804c] hover:bg-[#1f5c38] text-white">
                    Request Loan
                  </Button>
                  <Button variant="outline" className="border-[#274add] text-[#274add] dark:text-white dark:border-gray-600">
                    View Statements
                  </Button>
                  <Button variant="outline" className="border-[#274add] text-[#274add] dark:text-white dark:border-gray-600">
                    Download Reports
                  </Button>
                </div>
              </Card>

              {/* Account Summary */}
              <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Account Summary</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <span className="text-gray-700 dark:text-gray-300">Account Status</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <span className="text-gray-700 dark:text-gray-300">Member Since</span>
                    <span className="text-gray-900 dark:text-white font-medium">January 15, 2024</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <span className="text-gray-700 dark:text-gray-300">Total Transactions</span>
                    <span className="text-gray-900 dark:text-white font-medium">24</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "members" && (
            <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Members Management</h2>
              <p className="text-gray-600 dark:text-gray-400">Members section coming soon...</p>
            </Card>
          )}

          {activeTab === "deposits" && (
            <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Deposits</h2>
              <p className="text-gray-600 dark:text-gray-400">Deposits section coming soon...</p>
            </Card>
          )}

          {activeTab === "loans" && (
            <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Loans</h2>
              <p className="text-gray-600 dark:text-gray-400">Loans section coming soon...</p>
            </Card>
          )}

          {activeTab === "reports" && (
            <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Reports & Analytics</h2>
              <p className="text-gray-600 dark:text-gray-400">Reports & Analytics section coming soon...</p>
            </Card>
          )}

          {activeTab === "settings" && (
            <Card className="p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Settings</h2>
              <p className="text-gray-600 dark:text-gray-400">Settings section coming soon...</p>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
