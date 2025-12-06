import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  CreditCard, 
  BarChart3, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Overview", path: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Members", path: "/members", icon: <Users className="h-5 w-5" /> },
  { label: "Deposits", path: "/deposits", icon: <Wallet className="h-5 w-5" /> },
  { label: "Loans", path: "/loans", icon: <CreditCard className="h-5 w-5" /> },
  { label: "Reports & Analytics", path: "/reports", icon: <BarChart3 className="h-5 w-5" /> },
  { label: "Settings", path: "/settings", icon: <Settings className="h-5 w-5" /> },
];

export function Sidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-card border border-border rounded-lg p-2 hover:bg-muted"
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-foreground" />
        ) : (
          <Menu className="h-5 w-5 text-foreground" />
        )}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-card border-r border-border transition-all duration-300 z-40 
          ${collapsed ? "w-16" : "w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Collapse Toggle Button - Desktop Only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:block absolute -right-3 top-6 bg-card border border-border rounded-full p-1 hover:bg-muted transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-foreground" />
          )}
        </button>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 p-3 pt-6">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <button
                  onClick={() => setMobileOpen(false)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                  title={collapsed ? item.label : ""}
                >
                  {item.icon}
                  {!collapsed && (
                    <span className="font-medium text-sm">{item.label}</span>
                  )}
                </button>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}