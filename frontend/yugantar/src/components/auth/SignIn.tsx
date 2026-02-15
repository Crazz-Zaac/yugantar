import { useState } from "react"
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useAuth } from "@/contexts/AuthContext"
import yugantarLogo from "@/assets/yugantar_logo.svg"

export function SignIn({
  onSignIn,
  onGoToSignUp,
}: {
  onSignIn: (role: "member" | "admin") => void
  onGoToSignUp: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email || !password) {
      setError("Please fill in all fields.")
      return
    }

    setIsLoading(true)
    try {
      const user = await login(email, password)
      const role = user.access_roles.includes("admin") ? "admin" : "member"
      onSignIn(role)
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Invalid email or password. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel - branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex lg:w-[480px] xl:w-[540px]">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <img src={yugantarLogo} alt="Yugantar" className="h-10 w-10" />
            </div>
            <span className="text-lg font-bold text-sidebar-primary-foreground">Yugantar</span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-6">
          <blockquote className="flex flex-col gap-4">
            <p className="text-balance text-2xl font-semibold leading-snug text-sidebar-primary-foreground">
              Empowering communities through transparent cooperative finance.
            </p>
            <p className="text-pretty text-sm leading-relaxed text-sidebar-foreground">
              Yugantar gives your cooperative the tools to manage savings, loans, and investments
              with full transparency and trust among members.
            </p>
          </blockquote>

          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-bold text-primary">2,400+</p>
              <p className="text-xs text-sidebar-foreground/60">Active Members</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">$12.8M</p>
              <p className="text-xs text-sidebar-foreground/60">Total Deposits</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">99.2%</p>
              <p className="text-xs text-sidebar-foreground/60">Repayment Rate</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-sidebar-foreground/40">
          &copy; 2026 Yugantar Cooperative. All rights reserved.
        </p>

        {/* Background decoration */}
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5" />
        <div className="absolute -top-16 right-20 h-48 w-48 rounded-full bg-primary/5" />
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <img src={yugantarLogo} alt="Yugantar" className="h-10 w-10" />
            </div>
            <span className="text-sm font-bold text-foreground">Yugantar</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your Yugantar account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@cooperative.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-background"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-background pr-10"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="remember" className="text-sm text-muted-foreground">
                  Remember me for 30 days
                </Label>
              </div>

              <Button type="submit" className="h-11 gap-2 font-medium" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground">or continue with</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-11 flex-1 gap-2 text-sm font-medium" type="button" disabled={isLoading}>
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </Button>
              <Button variant="outline" className="h-11 flex-1 gap-2 text-sm font-medium" type="button" disabled={isLoading}>
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.18 0-.36-.02-.53-.06-.01-.18-.04-.56-.04-.95 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.22.05.45.05.69zm3.838 17.18c-.02.04-.35.12-.35.12s-1.828 3.05-3.65 3.05c-.96 0-1.56-.57-2.49-.57-.96 0-1.78.59-2.49.59-1.72 0-3.89-3.46-3.89-6.24 0-2.81 1.94-4.37 3.68-4.37 1.08 0 1.95.65 2.49.65.54 0 1.56-.72 2.75-.65.78.02 2.95.3 3.64 2.44-.07.04-2.17 1.23-2.17 3.74 0 2.98 2.63 4.06 2.63 4.06l-.14.18z" />
                </svg>
                Apple
              </Button>
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {"Don't have an account? "}
              <button
                type="button"
                onClick={onGoToSignUp}
                className="font-semibold text-primary hover:text-primary/80"
              >
                Create one
              </button>
            </p>

            <p className="mt-4 text-center text-xs text-muted-foreground/60">
              Use <span className="font-mono text-xs text-muted-foreground">admin@yugantar.com</span> to sign in as Admin
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
