import { useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Navigation";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const authToken = localStorage.getItem("access_token");
    if (!authToken) {
      setLocation("/login");
    }
  }, [setLocation]);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showLogout={true} onLogout={handleLogout} />
      
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content - responsive margins */}
      <main className="pt-16 lg:ml-64 px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300">
        <div className="max-w-7xl mx-auto space-y-8 text-left">
          {children}
        </div>
      </main>
    </div>
  );
}