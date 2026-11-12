import { t } from "@/lib/i18n"
import { useState } from "react"
import { apiClient } from "@/api/api"
import { Eye, EyeOff, ArrowRight, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { useAuth } from "@/contexts/AuthContext"
import yugantarLogo from "@/assets/yugantar_logo.svg"
import { toast } from "sonner"
import { apiError } from "@/components/policies/signing"

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Contains number", met: /\d/.test(password) },
    { label: "Contains special character", met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ]

  const metCount = checks.filter((c) => c.met).length

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= metCount
              ? metCount <= 1
                ? "bg-destructive"
                : metCount <= 2
                  ? "bg-warning"
                  : "bg-success"
              : "bg-muted"
              }`}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-center gap-1.5 text-xs ${check.met ? "text-success" : "text-muted-foreground"
              }`}
          >
            {check.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {t(check.label)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SignUp({ onGoToSignIn }: { onGoToSignIn: () => void }) {
  // Set after a successful registration: show "check your email" instead of the form
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const { signup } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!firstName || !lastName || !email || !phone) {
      setError(t("Please fill in all required fields."))
      return
    }

    if (password !== confirmPassword) {
      setError(t("Passwords do not match."))
      return
    }

    if (password.length < 8) {
      setError(t("Password must be at least 8 characters."))
      return
    }

    if (!agreed) {
      setError(t("Please agree to the terms and conditions."))
      return
    }

    setIsLoading(true)
    try {
      await signup(
        {
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          address: address || undefined,
        },
        password
      )
      setRegisteredEmail(email)
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        t("Failed to create account. Please try again.")
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (registeredEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">{t("Check your email")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("We sent a verification link to ")}<span className="font-medium text-foreground">{registeredEmail}</span>.
          </p>
          <ol className="mt-4 space-y-1 text-left text-sm text-muted-foreground">
            <li>{t("1. Open the link to verify your email address.")}</li>
            <li>{t("2. An administrator then reviews and approves your registration.")}</li>
            <li>{t("3. You'll get an email once your account is approved, and can then sign in.")}</li>
          </ol>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={onGoToSignIn}>{t("Back to sign in")}</Button>
            <Button
              variant="ghost"
              onClick={() =>
                apiClient
                  .post("/users/resend-verification", { email: registeredEmail })
                  .then(() => toast.success(t("Verification email sent"), { description: t("Check your inbox (and spam folder).") }))
                  .catch((err) => toast.error(apiError(err, t("Could not resend right now. Please try again later."))))
              }
            >
              {t("Resend verification email")}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel - branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex lg:w-[480px] xl:w-[540px]">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <img src={yugantarLogo} alt={t("Yugantar")} className="h-10 w-10" />
            </div>
            <span className="text-lg font-bold text-sidebar-primary-foreground">{t("Yugantar")}</span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <p className="text-balance text-2xl font-semibold leading-snug text-sidebar-primary-foreground">
              {t("Join a growing network of cooperative members.")}</p>
            <p className="text-pretty text-sm leading-relaxed text-sidebar-foreground">
              {t("Create your account and start benefiting from shared savings, low-interest loans, and transparent investment opportunities.")}</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-sidebar-primary-foreground">{t("Competitive Returns")}</p>
                <p className="text-xs text-sidebar-foreground/60">{t("Earn up to 8.5% on your savings annually")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-sidebar-primary-foreground">{t("Low-Interest Loans")}</p>
                <p className="text-xs text-sidebar-foreground/60">{t("Access loans starting at 4.2% interest rate")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-sidebar-primary-foreground">{t("Full Transparency")}</p>
                <p className="text-xs text-sidebar-foreground/60">{t("See exactly how your cooperative funds are managed")}</p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-sidebar-foreground/40">
          {t("© 2026 Yugantar Cooperative. All rights reserved.")}</p>

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
              <img src={yugantarLogo} alt={t("Yugantar")} className="h-10 w-10" />
            </div>
            <span className="text-sm font-bold text-foreground">{t("Yugantar")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("Create an account")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Enter your details to get started. Your role will be assigned by a cooperative administrator.")}</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="firstName" className="text-sm font-medium text-foreground">
                    {t("First name ")}<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder={t("John")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-11 bg-background"
                    autoComplete="given-name"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="lastName" className="text-sm font-medium text-foreground">
                    {t("Last name ")}<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    placeholder={t("Doe")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-11 bg-background"
                    autoComplete="family-name"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupEmail" className="text-sm font-medium text-foreground">
                  {t("Email address ")}<span className="text-destructive">*</span>
                </Label>
                <Input
                  id="signupEmail"
                  type="email"
                  placeholder={t("you@cooperative.org")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-background"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupPhone" className="text-sm font-medium text-foreground">
                  {t("Phone number ")}<span className="text-destructive">*</span>
                </Label>
                <Input
                  id="signupPhone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 bg-background"
                  autoComplete="tel"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupAddress" className="text-sm font-medium text-foreground">
                  {t("Address")}</Label>
                <Input
                  id="signupAddress"
                  placeholder={t("Your address")}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 bg-background"
                  autoComplete="street-address"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupPassword" className="text-sm font-medium text-foreground">
                  {t("Password ")}<span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="signupPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("Create a strong password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-background pr-10"
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t("Hide password") : t("Show password")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && <PasswordStrength password={password} />}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                  {t("Confirm password ")}<span className="text-destructive">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("Re-enter your password")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 bg-background"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">{t("Passwords do not match.")}</p>
                )}
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={agreed}
                  onCheckedChange={(checked) => setAgreed(checked === true)}
                  className="mt-0.5"
                  disabled={isLoading}
                />
                <Label htmlFor="terms" className="text-xs leading-relaxed text-muted-foreground">
                  {t("I agree to the  Terms of Service and  Privacy Policy, and acknowledge the cooperative membership guidelines.")}</Label>
              </div>

              <Button type="submit" className="mt-1 h-11 gap-2 font-medium" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Creating account...")}</>
                ) : (
                  <>
                    {t("Create account")}<ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t("Already have an account?")}{" "}
              <button
                type="button"
                onClick={onGoToSignIn}
                className="font-semibold text-primary hover:text-primary/80"
              >
                {t("Sign in")}</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
