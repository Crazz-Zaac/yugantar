import { useState } from "react"
import { User, Lock, Bell, Globe, Save, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/AuthContext"

export function SettingsTab() {
  const { user, updateProfile, changePassword } = useAuth()

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
      setProfileMessage("Profile updated successfully!")
    } catch (err: any) {
      setProfileMessage(err?.message || "Failed to update profile")
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters")
      return
    }
    setPasswordLoading(true)
    setPasswordMessage("")
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage("Password changed successfully!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      setPasswordMessage(err?.message || "Failed to change password")
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account preferences and security</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="profile" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs">
            <Lock className="h-3.5 w-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5 text-xs">
            <Globe className="h-3.5 w-3.5" />
            Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Personal Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {profileMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${profileMessage.includes("success") ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  {profileMessage}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="first-name" className="text-xs font-medium">First Name</Label>
                  <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last-name" className="text-xs font-medium">Last Name</Label>
                  <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                  <Input id="email" type="email" value={email} disabled className="bg-muted" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="phone" className="text-xs font-medium">Phone Number</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address" className="text-xs font-medium">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="member-id" className="text-xs font-medium">Member ID</Label>
                <Input id="member-id" value={user?.id ?? ""} disabled className="bg-muted font-mono text-xs" />
              </div>
              <Button
                className="self-end bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleProfileSave}
                disabled={profileLoading}
              >
                {profileLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />Save Changes</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Password & Security</CardTitle>
              <CardDescription>Keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {passwordMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${passwordMessage.includes("success") ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                  {passwordMessage}
                </div>
              )}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="current-password" className="text-xs font-medium">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-password" className="text-xs font-medium">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="confirm-password" className="text-xs font-medium">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Login Notifications</p>
                  <p className="text-xs text-muted-foreground">Get notified when someone logs into your account</p>
                </div>
                <Switch defaultChecked />
              </div>

              <Button
                className="self-end bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePasswordChange}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />Update Security</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Notification Preferences</CardTitle>
              <CardDescription>Choose what you want to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {[
                { label: "Loan Payment Reminders", desc: "Get reminded before your payment due date", defaultChecked: true },
                { label: "Deposit Confirmations", desc: "Notify when your deposit is confirmed", defaultChecked: true },
                { label: "Dividend Announcements", desc: "Annual dividend payouts and updates", defaultChecked: true },
                { label: "Policy Changes", desc: "Changes to cooperative policies and rates", defaultChecked: false },
                { label: "Community Updates", desc: "General cooperative news and events", defaultChecked: false },
                { label: "Investment Opportunities", desc: "New investment options available", defaultChecked: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.defaultChecked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">App Preferences</CardTitle>
              <CardDescription>Customize your experience</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="language" className="text-xs font-medium">Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger id="language" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="currency" className="text-xs font-medium">Display Currency</Label>
                <Select defaultValue="usd">
                  <SelectTrigger id="currency" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="ghs">GHS (GH&#8373;)</SelectItem>
                    <SelectItem value="eur">EUR (&euro;)</SelectItem>
                    <SelectItem value="gbp">GBP (&pound;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="timezone" className="text-xs font-medium">Timezone</Label>
                <Select defaultValue="gmt">
                  <SelectTrigger id="timezone" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmt">GMT+0 (Accra)</SelectItem>
                    <SelectItem value="wat">GMT+1 (Lagos)</SelectItem>
                    <SelectItem value="eat">GMT+3 (Nairobi)</SelectItem>
                    <SelectItem value="utc">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="self-end bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
