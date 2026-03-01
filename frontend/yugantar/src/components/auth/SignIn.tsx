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
                <span className="bg-background px-3 text-xs text-muted-foreground">Or Sign Up</span>
              </div>
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
          </div>
        </div>
      </div>
    </div>
  )
}
