import { useState } from "react";
import { Toaster } from "@components/ui/sonner";
import { TooltipProvider } from "@components/ui/tooltip";
import NotFound from "@pages/NotFound";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";

import { SignIn } from "./components/auth/SignIn";
import { SignUp } from "./components/auth/SignUp";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { MemberDashboard } from "./components/member/MemberDashboard";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  // If already authenticated, redirect to appropriate dashboard
  if (isAuthenticated && user) {
    const isAdmin = user.access_roles.includes("admin");
    return <Redirect to={isAdmin ? "/admin" : "/dashboard"} />;
  }

  const handleSignIn = (role: "member" | "admin") => {
    navigate(role === "admin" ? "/admin" : "/dashboard");
  };

  const handleSignUp = (role: "member" | "admin") => {
    navigate(role === "admin" ? "/admin" : "/dashboard");
  };

  if (mode === "signup") {
    return (
      <SignUp
        onSignUp={handleSignUp}
        onGoToSignIn={() => setMode("signin")}
      />
    );
  }

  return (
    <SignIn
      onSignIn={handleSignIn}
      onGoToSignUp={() => setMode("signup")}
    />
  );
}

function ProtectedAdminDashboard() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user, logout, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Redirect to="/login" />;

  return (
    <AdminDashboard
      onLogout={() => {
        logout();
        navigate("/login");
      }}
    />
  );
}

function ProtectedMemberDashboard() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user, logout, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Redirect to="/login" />;

  return (
    <MemberDashboard
      onLogout={() => {
        logout();
        navigate("/login");
      }}
    />
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={AuthPage} />
      <Route path={"/login"} component={AuthPage} />
      <Route path={"/dashboard"} component={ProtectedMemberDashboard} />
      <Route path={"/admin"} component={ProtectedAdminDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
