import { useState, useEffect } from "react";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Logo from "@/assets/yugantar_logo.svg";

interface HeaderProps {
  title?: string;
  showLogout?: boolean;
  onLogout?: () => void;
}

export const Header = ({
  title = "Yugantar Wealth Management System",
  showLogout = true,
  onLogout,
}: HeaderProps) => {
  const [isDark, setIsDark] = useState(false);
  const [notifications, setNotifications] = useState(3);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    if (onLogout) onLogout();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border h-16">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center text-primary-foreground font-bold text-sm">
            <img
              src={Logo}
              alt="Yugantar Mutual Fund"
              className="w-full h-full"
            />
          </div>
          <h1 className="text-lg font-semibold text-foreground hidden sm:block">
            {title}
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-foreground hover:bg-primary/10"
            >
              <Bell className="h-5 w-5" />
              {notifications > 0 && (
                <span className="absolute top-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {notifications}
                </span>
              )}
            </Button>
          </div>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-foreground hover:bg-primary/10"
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* Logout */}
          {showLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2 hidden sm:flex border-border text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
