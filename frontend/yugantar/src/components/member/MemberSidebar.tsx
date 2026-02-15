import { Home, Landmark, CreditCard, Settings, PanelLeftClose, PanelLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import yugantarLogo from "@/assets/yugantar_logo.svg"

type Tab = "home" | "deposit" | "loans" | "settings"

const navItems = [
  { id: "home" as Tab, label: "Home", icon: Home },
  { id: "deposit" as Tab, label: "Deposit", icon: Landmark },
  { id: "loans" as Tab, label: "Loans", icon: CreditCard },
  { id: "settings" as Tab, label: "Settings", icon: Settings },
]

export function MemberSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
}: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { user } = useAuth()
  const displayName = user ? `${user.first_name} ${user.last_name}`.trim() : "Member"
  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase()
    : "M"
  const memberId = user?.id ? `COOP-${user.id.slice(0, 8).toUpperCase()}` : ""

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center py-5", collapsed ? "justify-center px-3" : "gap-3 px-6")}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
            <img src={yugantarLogo} alt="Yugantar" className="h-10 w-10" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-sidebar-primary-foreground">Yugantar</h1>
              <p className="text-[11px] text-sidebar-foreground/60">Member Portal</p>
            </div>
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-1" role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange(item.id)}
                      className={cn(
                        "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                        activeTab === item.id
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </li>
            ))}
          </ul>
        </nav>

        {/* Collapse toggle */}
        <div className="px-3 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  collapsed ? "w-full" : "w-8"
                )}
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* User info */}
        <div className={cn("flex items-center py-4", collapsed ? "justify-center px-3" : "gap-3 px-4")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 shrink-0 bg-sidebar-accent">
                <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{memberId}</p>
              </TooltipContent>
            )}
          </Tooltip>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-primary-foreground">{displayName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">{memberId}</p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
