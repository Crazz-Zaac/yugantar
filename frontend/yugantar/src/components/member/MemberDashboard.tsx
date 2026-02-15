import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { MemberSidebar } from "./MemberSidebar"
import { HomeTab } from "./HomeTab"
import { DepositTab } from "./DepositTab"
import { LoansTab } from "./LoansTab"
import { SettingsTab } from "./SettingsTab"
import { MemberPoliciesTab } from "./MemberPoliciesTab"
import { ThemeToggle } from "@/components/ThemeToggle"
import { NotificationPanel } from "@/components/NotificationPanel"
import { Button } from "@/components/ui/button"
import { Menu, LogOut } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export type MemberTab = "home" | "deposit" | "loans" | "policies" | "settings"

const tabTitles: Record<MemberTab, string> = {
  home: "Dashboard",
  deposit: "Make Deposit",
  loans: "Loans",
  policies: "Policies",
  settings: "Settings",
}

/** Map URL segment to tab id */
const segmentToTab: Record<string, MemberTab> = {
  "": "home",
  deposit: "deposit",
  loans: "loans",
  policies: "policies",
  settings: "settings",
}

/** Map tab id to URL path */
const tabToPath: Record<MemberTab, string> = {
  home: "/dashboard",
  deposit: "/dashboard/deposit",
  loans: "/dashboard/loans",
  policies: "/dashboard/policies",
  settings: "/dashboard/settings",
}

export function MemberDashboard({
  onLogout,
}: {
  onLogout: () => void
}) {
  const [location, navigate] = useLocation()

  // Derive the active tab from the current URL
  const activeTab: MemberTab = useMemo(() => {
    const segment = location.replace(/^\/dashboard\/?/, "").split("/")[0] || ""
    return segmentToTab[segment] ?? "home"
  }, [location])

  const handleTabChange = (tab: MemberTab) => {
    navigate(tabToPath[tab])
    setSidebarOpen(false)
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <HomeTab />
      case "deposit":
        return <DepositTab />
      case "loans":
        return <LoansTab />
      case "policies":
        return <MemberPoliciesTab />
      case "settings":
        return <SettingsTab />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <MemberSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-sm font-semibold text-foreground">{tabTitles[activeTab]}</h2>
          </div>
          <div className="flex items-center gap-1">
            <NotificationPanel />
            <ThemeToggle />
            <Separator orientation="vertical" className="mx-1 h-6" />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={onLogout}
                    aria-label="Log out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Log out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}
