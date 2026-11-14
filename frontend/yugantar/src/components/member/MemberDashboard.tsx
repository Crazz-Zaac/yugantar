import { t } from "@/lib/i18n"
import { useState, useEffect, useMemo } from "react"
import { useLocation } from "wouter"
import { MemberSidebar } from "./MemberSidebar"
import { HomeTab } from "./HomeTab"
import { DepositTab } from "./DepositTab"
import { LoansTab } from "./LoansTab"
import { SettingsTab } from "./SettingsTab"
import { MemberPoliciesTab } from "./MemberPoliciesTab"
import { CalendarTab } from "@/components/tools/CalendarTab"
import { MeetingsTab } from "@/components/tools/MeetingsTab"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { NotificationPanel } from "@/components/NotificationPanel"
import { Button } from "@/components/ui/button"
import { Menu, LogOut, Home, Landmark, CreditCard, CalendarDays, MoreHorizontal } from "lucide-react"

// Phones: bottom navigation (thumb-reachable): the most used sections, and
// "More" opens the full menu (Policies, Meetings, Settings)
const bottomNav: { id: MemberTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "deposit", label: "Deposit", icon: Landmark },
  { id: "loans", label: "Loans", icon: CreditCard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
]
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export type MemberTab = "home" | "deposit" | "loans" | "policies" | "calendar" | "meetings" | "settings"

const tabTitles: Record<MemberTab, string> = {
  home: "Dashboard",
  deposit: "Deposits",
  loans: "Loans",
  policies: "Policies",
  calendar: "Calendar",
  meetings: "Meetings",
  settings: "Settings",
}

/** Map URL segment to tab id */
const segmentToTab: Record<string, MemberTab> = {
  "": "home",
  deposit: "deposit",
  loans: "loans",
  policies: "policies",
  calendar: "calendar",
  meetings: "meetings",
  settings: "settings",
}

/** Map tab id to URL path */
const tabToPath: Record<MemberTab, string> = {
  home: "/dashboard",
  deposit: "/dashboard/deposit",
  loans: "/dashboard/loans",
  policies: "/dashboard/policies",
  calendar: "/dashboard/calendar",
  meetings: "/dashboard/meetings",
  settings: "/dashboard/settings",
}

export function MemberDashboard({ onLogout }: { onLogout: () => void }) {
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
      case "calendar":
        return <CalendarTab />
      case "meetings":
        return <MeetingsTab />
      case "settings":
        return <SettingsTab />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
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
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label={t("Open menu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-sm font-semibold text-foreground">{t(tabTitles[activeTab])}</h2>
          </div>
          <div className="flex items-center gap-1">
            <NotificationPanel />
            <LanguageToggle />
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
                    aria-label={t("Log out")}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("Log out")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* Page content (extra bottom padding on phones for the bottom bar) */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 lg:p-6">{renderContent()}</div>
      </main>

      <nav
        aria-label={t("Main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {bottomNav.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => handleTabChange(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-primary/10" : ""}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {t(label)}
                </button>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-current={["policies", "meetings", "settings"].includes(activeTab) ? "page" : undefined}
              className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                ["policies", "meetings", "settings"].includes(activeTab)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  ["policies", "meetings", "settings"].includes(activeTab) ? "bg-primary/10" : ""
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </span>
              {t("More")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  )
}
