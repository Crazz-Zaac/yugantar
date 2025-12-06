import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Lock, Bell, Shield, BadgeCheck, BadgeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getEditableFields } from "@/utils/normalizeUser";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("account");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const { user, updateProfile } = useAuth();

  const [formData, setFormData] = useState(getEditableFields(user));

  // Update formData when user data loads
  useEffect(() => {
    if (user) {
      setFormData(getEditableFields(user));
    }
  }, [user]);

  const isAdmin = user?.access_roles?.split(",").includes("admin");

  const handleEdit = () => {
    console.log("Edit clicked!");
    setIsEditing(true);
    setFormData(getEditableFields(user));
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    setIsSaving(true);
    try {
      await updateProfile(formData);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("account")}
          className={`px-4 py-2 font-medium rounded-none border-b-2 transition-all ${
            activeTab === "account"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Account
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`px-4 py-2 font-medium rounded-none border-b-2 transition-all ${
            activeTab === "security"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Security
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          className={`px-4 py-2 font-medium rounded-none border-b-2 transition-all ${
            activeTab === "notifications"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Notifications
        </button>
      </div>

      {/* Account Settings */}
      {activeTab === "account" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">
              User Roles & Details
            </h2>
            <p className="text-sm text-muted-foreground">
              Your assigned roles. Only administrators can modify user roles.
              Contact an admin if you need role changes.
            </p>
            {/* Roles Display - Read Only with Admin Info */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex flex-wrap gap-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Member Since:
                </label>
                <input
                  type="text"
                  value={
                    user?.joined_at
                      ? new Date(user.joined_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : ""
                  }
                  readOnly
                />
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Access Role:
                  </label>
                  {user?.access_roles?.split(",").map((role: string) => (
                    <span
                      key={role}
                      className="px-3 py-1 bg-blue-600 rounded-full text-white text-xs font-medium capitalize"
                    >
                      {role}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Cooperative Role:
                  </label>
                  {user?.cooperative_roles?.split(",").map((role: string) => (
                    <span
                      key={role}
                      className="px-3 py-1 bg-blue-500 rounded-full text-white text-xs font-medium capitalize"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              {/* Account Status Info Box */}
              <div className="flex items-center gap-3 p-4 border border-border rounded bg-muted/30">
                {user?.is_verified === "true" ? (
                  <BadgeCheck className="h-6 w-6 text-green-500" />
                ) : (
                  <BadgeX className="h-6 w-6 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Account Status
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.is_verified === "true"
                      ? "Your account is verified"
                      : "Account verification pending"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                    {error}
                  </div>
                )}

                {/* Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      First Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                        {user?.first_name || "Not provided"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Middle Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="middle_name"
                        value={formData.middle_name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground text-muted-foreground">
                        {user?.middle_name || "Not provided"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Last Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                        {user?.last_name || "Not provided"}
                      </div>
                    )}
                  </div>
                </div>

                {/* DOB, Email and Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Date of Birth
                    </label>
                    {isEditing ? (
                      <input
                        type="date"
                        name="date_of_birth"
                        value={formData.date_of_birth}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                        {user?.date_of_birth
                          ? new Date(user.date_of_birth).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )
                          : "Not provided"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Gender
                    </label>
                    {isEditing ? (
                      <select
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground capitalize">
                        {user?.gender || "Not specified"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Email Address
                    </label>
                    <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                      {user?.email || "Not provided"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Phone Number
                    </label>
                    {isEditing ? (
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                        {user?.phone || "Not provided"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Address
                  </label>
                  {isEditing ? (
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  ) : (
                    <div className="w-full px-3 py-2 border border-border rounded bg-muted/30 text-foreground">
                      {user?.address || "Not provided"}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  {isEditing ? (
                    <>
                      <Button
                        onClick={handleCancel}
                        variant="outline"
                        disabled={isSaving}
                        className="border-border"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleEdit}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
                    >
                      Edit Profile
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Password
                </h2>
              </div>
              <Button variant="outline" className="border-border">
                Change Password
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Two-Factor Authentication
              </h2>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enhance your account security by enabling 2FA
              </p>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Enable Two-Factor Authentication
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      {activeTab === "notifications" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Email Notifications
              </h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                <span className="text-foreground">Deposit confirmations</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                <span className="text-foreground">Loan updates</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                <span className="text-foreground">Interest credits</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                <span className="text-foreground">Payment reminders</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-3 border border-border rounded cursor-pointer hover:bg-muted/50">
                <span className="text-foreground">System updates</span>
                <input type="checkbox" className="rounded" />
              </label>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}