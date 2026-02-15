import { useState, useMemo } from "react"
import { useLocation } from "wouter"
import { AdminSidebar } from "./AdminSidebar"
import { OverviewTab } from "./OverviewTab"
import { MembersTab } from "./MembersTab"
import { ActivityTab } from "./ActivityTab"
import { PoliciesTab } from "./PoliciesTab"
import { ThemeToggle } from "@/components/ThemeToggle"
import { NotificationPanel } from "@/components/NotificationPanel"
import { Button } from "@/components/ui/button"
import { Menu, LogOut } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export type AdminTab = "overview" | "members" | "activity" | "policies"

const tabTitles: Record<AdminTab, string> = {
  overview: "Overview",
  members: "Members",
  activity: "Activity Log",
  policies: "Policies",
}

/** Map URL segment to tab id */
const segmentToTab: Record<string, AdminTab> = {
  "": "overview",
  members: "members",
  activity: "activity",
  policies: "policies",
}

/** Map tab id to URL path */
const tabToPath: Record<AdminTab, string> = {
  overview: "/admin",
  members: "/admin/members",
  activity: "/admin/activity",
  policies: "/admin/policies",
}

export function AdminDashboard({
  onLogout,
}: {
  onLogout: () => void
}) {
  const [location, navigate] = useLocation()

  // Derive the active tab from the current URL
  const activeTab: AdminTab = useMemo(() => {
    const segment = location.replace(/^\/admin\/?/, "").split("/")[0] || ""
    return segmentToTab[segment] ?? "overview"
  }, [location])

  const handleTabChange = (tab: AdminTab) => {
    navigate(tabToPath[tab])
    setSidebarOpen(false)
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />
      case "members":
        return <MembersTab />
      case "activity":
        return <ActivityTab />
      case "policies":
        return <PoliciesTab />
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
        <AdminSidebar
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
