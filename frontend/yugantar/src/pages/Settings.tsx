import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Bell,
  Shield,
  BadgeCheck,
  BadgeX,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getEditableFields } from "@/utils/normalizeUser";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("account");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const { user, updateProfile, changePassword } = useAuth();
  const [, setLocation] = useLocation();

  // Profile Form State
  const [formData, setFormData] = useState(getEditableFields(user));

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const validatePassword = (password: string) => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    if (new TextEncoder().encode(password).length > 72) {
      errors.push("Password cannot exceed 72 bytes");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one digit");
    }

    return errors;
  };

  // track password validation errors
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<
    string[]
  >([]);

  useEffect(() => {
    if (user) {
      setFormData(getEditableFields(user));
    }
  }, [user]);

  const isAdmin = user?.access_roles?.split(",").includes("admin");

  const handleEdit = () => {
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
      toast.success("Profile updated successfully!");
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to update profile";
      setError(errorMsg);
      toast.error(errorMsg);
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

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setPasswordData(prev => ({
      ...prev,
      [name]: value,
    }));

    setPasswordError("");

    if (name === "newPassword") {
      const validationErrors = validatePassword(value);
      setPasswordValidationErrors(validationErrors);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");

    // Validate new password
    const validationErrors = validatePassword(passwordData.newPassword);
    if (validationErrors.length > 0) {
      setPasswordValidationErrors(validationErrors);
      return;
    }

    // Validation
    if (!passwordData.currentPassword) {
      setPasswordError("Please enter your current password");
      return;
    }
    if (!passwordData.newPassword) {
      setPasswordError("Please enter a new password");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(
        passwordData.currentPassword,
        passwordData.newPassword
      );
      toast.success("Password changed successfully!");
      // Success message
      toast.success(
        "Password changed successfully! Please log in again with your new password.",
        {
          duration: 5000,
        }
      );

      setShowPasswordModal(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      // Redirect to login page after a short delay
      setTimeout(() => {
        setLocation("/login");
      }, 2000);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to change password";
      setPasswordError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsChangingPassword(false);
    }
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
              <Button
                variant="outline"
                className="border-border"
                onClick={() => setShowPasswordModal(true)}
              >
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

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-foreground mb-4">
              Change Password
            </h3>

            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm mb-4">
                {passwordError}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="w-full px-3 py-2 pr-10 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords(prev => ({
                        ...prev,
                        current: !prev.current,
                      }))
                    }
                    className="absolute right-3 top-2.5 text-muted-foreground"
                  >
                    {showPasswords.current ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="w-full px-3 py-2 pr-10 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords(prev => ({ ...prev, new: !prev.new }))
                    }
                    className="absolute right-3 top-2.5 text-muted-foreground"
                  >
                    {showPasswords.new ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {passwordValidationErrors.length > 0 &&
                  passwordData.newPassword && (
                    <ul className="text-red-500 text-xs mt-2 space-y-1">
                      {passwordValidationErrors.map((err, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-red-500 mt-0.5">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="w-full px-3 py-2 pr-10 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords(prev => ({
                        ...prev,
                        confirm: !prev.confirm,
                      }))
                    }
                    className="absolute right-3 top-2.5 text-muted-foreground"
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordData({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setPasswordError("");
                  }}
                  disabled={isChangingPassword}
                  className="border-border"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
