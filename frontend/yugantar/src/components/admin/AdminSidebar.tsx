import { t } from "@/lib/i18n"
import { LayoutDashboard, Users, Activity, ScrollText, ChevronsLeft, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import yugantarLogo from "@/assets/yugantar_logo.svg"
import type { AdminTab } from "./AdminDashboard"

const navItems = [
  { id: "overview" as AdminTab, label: "Overview", icon: LayoutDashboard },
  { id: "members" as AdminTab, label: "Members", icon: Users },
  { id: "activity" as AdminTab, label: "Activity", icon: Activity },
  { id: "policies" as AdminTab, label: "Policies", icon: ScrollText },
]

export function AdminSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
}: {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { user } = useAuth()
  const displayName = user ? `${user.first_name} ${user.last_name}`.trim() : t("Admin")
  const initials = user ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() : "AD"
  const roleBadge = user?.access_roles?.includes("admin") ? t("Super Admin") : t("Admin")

  return (
    // Tooltips are remounted (closed) whenever the sidebar collapses or expands:
    // hovering links while expanded leaves them "open" with no bubble, and they
    // would all pop up at once on collapse.
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-[68px]" : "w-56",
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center py-5", collapsed ? "justify-center px-3" : "gap-3 px-4")}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
            <img src={yugantarLogo} alt={t("Yugantar")} className="h-10 w-10" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-sidebar-primary-foreground">{t("Yugantar")}</h1>
              <p className="text-[11px] text-sidebar-foreground/60">{t("Admin Console")}</p>
            </div>
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-1" role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <Tooltip key={collapsed ? "collapsed" : "expanded"}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange(item.id)}
                      className={cn(
                        "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                        activeTab === item.id
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{t(item.label)}</span>}
                    </button>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" sideOffset={8}>
                      {t(item.label)}
                    </TooltipContent>
                  )}
                </Tooltip>
              </li>
            ))}
          </ul>
        </nav>

        {/* Collapse / expand */}
        <div className="hidden px-3 pb-3 lg:block">
          <Tooltip key={collapsed ? "collapsed" : "expanded"}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}
                aria-expanded={!collapsed}
                className={cn(
                  "flex h-9 w-full items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  collapsed ? "justify-center" : "gap-2 px-3",
                )}
              >
                {collapsed ? (
                  <ChevronsRight className="h-4 w-4 shrink-0" />
                ) : (
                  <>
                    <ChevronsLeft className="h-4 w-4 shrink-0" />
                    <span>{t("Collapse sidebar")}</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                {t("Expand sidebar")}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Admin info */}
        <div className={cn("flex items-center py-4", collapsed ? "justify-center px-3" : "gap-3 px-4")}>
          <Tooltip key={collapsed ? "collapsed" : "expanded"}>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 shrink-0 bg-destructive/20">
                <AvatarFallback className="bg-destructive/20 text-xs font-semibold text-sidebar-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{roleBadge}</p>
              </TooltipContent>
            )}
          </Tooltip>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-primary-foreground">{displayName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">{roleBadge}</p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
