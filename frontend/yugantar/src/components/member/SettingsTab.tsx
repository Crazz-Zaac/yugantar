import { t } from "@/lib/i18n"
import { useState } from "react"
import { User, Lock, Bell, Globe, Save, Loader2, ShieldCheck, BadgeCheck, Crown, Languages } from "lucide-react"
import { useLanguage } from "@/contexts/LanguageContext"
import { formatRs } from "@/lib/money"
import { formatDate } from "@/lib/datetime"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/AuthContext"

export function SettingsTab() {
  const { user, updateProfile, changePassword } = useAuth()
  const { lang, setLanguage } = useLanguage()
  const [langSaving, setLangSaving] = useState(false)
  // Remember the open tab: changing the language re-renders the whole app
  const [settingsTab, setSettingsTab] = useState(() => {
    try {
      return sessionStorage.getItem("yugantar.settingsTab") || "profile"
    } catch {
      return "profile"
    }
  })
  const chooseSettingsTab = (value: string) => {
    setSettingsTab(value)
    try {
      sessionStorage.setItem("yugantar.settingsTab", value)
    } catch {
      /* ignore */
    }
  }

  // Profile form state
  const [firstName, setFirstName] = useState(user?.first_name ?? "")
  const [lastName, setLastName] = useState(user?.last_name ?? "")
  const [email] = useState(user?.email ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [address, setAddress] = useState(user?.address ?? "")
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileMessage, setProfileMessage] = useState("")

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState("")

  const handleProfileSave = async () => {
    setProfileLoading(true)
    setProfileMessage("")
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
        address,
        middle_name: user?.middle_name ?? "",
        date_of_birth: user?.date_of_birth ?? "",
        gender: (user?.gender as "male" | "female" | "other") ?? "other",
      })
      setProfileMessage(t("Profile updated successfully!"))
    } catch (err: any) {
      setProfileMessage(err?.message || t("Failed to update profile"))
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordMessage(t("Passwords do not match"))
      return
    }
    if (newPassword.length < 8) {
      setPasswordMessage(t("Password must be at least 8 characters"))
      return
    }
    setPasswordLoading(true)
    setPasswordMessage("")
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage(t("Password changed successfully!"))
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      setPasswordMessage(err?.message || t("Failed to change password"))
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("Settings")}</h2>
        <p className="text-sm text-muted-foreground">{t("Manage your account preferences and security")}</p>
      </div>

      <Tabs value={settingsTab} onValueChange={chooseSettingsTab} className="w-full">
        <TabsList className="h-auto w-full justify-start overflow-x-auto [scrollbar-width:none] [&>button]:shrink-0 sm:grid sm:max-w-lg sm:grid-cols-4">
          <TabsTrigger value="profile" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />
            {t("Profile")}</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs">
            <Lock className="h-3.5 w-3.5" />
            {t("Security")}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" />
            {t("Alerts")}</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5 text-xs">
            <Globe className="h-3.5 w-3.5" />
            {t("Preferences")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 flex flex-col gap-4">
          {/* Account Status — separate read-only card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Account Status")}</CardTitle>
              <CardDescription>{t("Your verification and role information")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Verification */}
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("Verification")}</div>
                  {user?.is_verified ? (
                    <Badge variant="outline" className="w-fit gap-1 border-success/30 bg-success/10 text-success text-xs">
                      <BadgeCheck className="h-3 w-3" />
                      {t("Verified")}</Badge>
                  ) : (
                    <Badge variant="outline" className="w-fit gap-1 border-warning/30 bg-warning/10 text-warning text-xs">
                      {t("Unverified")}</Badge>
                  )}
                </div>

                {/* Access Roles */}
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("Access Role")}</div>
                  <div className="flex flex-wrap gap-1">
                    {(user?.access_roles ?? []).map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs capitalize">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Cooperative Roles */}
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Crown className="h-3.5 w-3.5" />
                    {t("Cooperative Role")}</div>
                  <div className="flex flex-wrap gap-1">
                    {(user?.cooperative_roles ?? []).length > 0 ? (
                      user!.cooperative_roles.map((role) => (
                        <Badge key={role} variant="outline" className="text-xs capitalize">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("None assigned")}</span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {t("Roles and verification status are managed by administrators and cannot be changed here.")}</p>
            </CardContent>
          </Card>

          {/* Personal Information — editable card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Personal Information")}</CardTitle>
              <CardDescription>{t("Update your personal details")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {profileMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${profileMessage.includes("success") ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  {profileMessage}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="first-name" className="text-xs font-medium">{t("First Name")}</Label>
                  <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last-name" className="text-xs font-medium">{t("Last Name")}</Label>
                  <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email" className="text-xs font-medium">{t("Email")}</Label>
                  <Input id="email" type="email" value={email} disabled className="bg-muted" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="phone" className="text-xs font-medium">{t("Phone Number")}</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address" className="text-xs font-medium">{t("Address")}</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="member-id" className="text-xs font-medium">{t("Member ID")}</Label>
                <Input id="member-id" value={user?.id ?? ""} disabled className="bg-muted font-mono text-xs" />
              </div>
              <Button
                className="self-end bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleProfileSave}
                disabled={profileLoading}
              >
                {profileLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Saving...")}</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />{t("Save Changes")}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Password & Security")}</CardTitle>
              <CardDescription>{t("Keep your account secure")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {passwordMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${passwordMessage.includes("success") ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  {passwordMessage}
                </div>
              )}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="current-password" className="text-xs font-medium">{t("Current Password")}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder={t("Enter current password")}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-password" className="text-xs font-medium">{t("New Password")}</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder={t("Enter new password")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="confirm-password" className="text-xs font-medium">{t("Confirm Password")}</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder={t("Confirm new password")}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Button
                className="self-end bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePasswordChange}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Updating...")}</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />{t("Update Security")}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Notifications")}</CardTitle>
              <CardDescription>
                {t("You're notified in the app (the bell icon) and by email. These concern your money and your vote, so they can't be switched off.")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Deposits", desc: "When the Treasurer verifies or rejects a deposit you made." },
                { label: "Loans", desc: "Decisions on your loan applications and loan payments." },
                { label: "Policies", desc: "New policies to sign (with the one-week deadline) and whether they were adopted." },
                { label: "Proxy signatures", desc: "If a policy is signed on your behalf after you were consulted." },
                { label: "Account", desc: "Email verification, approval of your membership and password changes." },
                { label: "Office bearers", desc: "Deposits, loans and proxy requests waiting for your review (if you hold an office)." },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">{t(item.label)}</p>
                  <p className="text-xs text-muted-foreground">{t(item.desc)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Languages className="h-4 w-4 text-primary" />
                {t("Language")}
              </CardTitle>
              <CardDescription>
                {t("The language of the app and of the emails you receive. Saved to your account, so it follows you to any device.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("Language")}>
                {(
                  [
                    ["en", "English", "Dates in AD · 12 Nov 2026 · Rs. 1,00,000"],
                    ["ne", "नेपाली", "मिति वि.सं. मा · २०८३ कार्तिक २६ · रु. १,००,०००"],
                  ] as const
                ).map(([code, name, sample]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={lang === code}
                    lang={code}
                    disabled={langSaving}
                    onClick={async () => {
                      if (code === lang) return
                      setLangSaving(true)
                      try {
                        await setLanguage(code)
                      } finally {
                        setLangSaving(false)
                      }
                    }}
                    className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                      lang === code ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        lang === code ? "border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {lang === code && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{name}</span>
                      <span className="block text-xs text-muted-foreground">{sample}</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("Regional settings")}</CardTitle>
              <CardDescription>{t("Amounts and dates follow your language; times are always Nepal Time.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                {[
                  [t("Currency"), t("Nepali Rupee (Rs.)"), t("Amounts grouped as {0}", formatRs(100000))],
                  [
                    t("Dates"),
                    lang === "ne" ? t("Bikram Sambat (BS)") : t("English (AD)"),
                    t("e.g. {0}", formatDate(new Date().toISOString())),
                  ],
                  [t("Time zone"), t("Nepal Time (NPT)"), t("UTC+5:45, wherever you are")],
                ].map(([label, value, hint]) => (
                  <div key={label} className="rounded-lg border p-4">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                    <dd className="text-xs text-muted-foreground">{hint}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
