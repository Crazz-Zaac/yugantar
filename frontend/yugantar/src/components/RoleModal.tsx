import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCESS_ROLES,
  AccessRole,
  COOPERATIVE_ROLES,
  CooperativeRole,
} from "@/constants";
import { UserForUI } from "@/utils/normalizeUser";

// Role Modal Props for editing user roles
interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserForUI | null;
  onSave: (
    accessRoles: AccessRole[],
    cooperativeRoles: CooperativeRole[]
  ) => Promise<void>;
}

// Role Modal Component
export function RoleModal({ isOpen, onClose, user, onSave }: RoleModalProps) {
  const [selectedAccessRole, setSelectedAccessRole] = useState<AccessRole | null>(null);
  const [selectedCooperativeRole, setSelectedCooperativeRole] = useState<CooperativeRole | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      // Set the first access role if available
      setSelectedAccessRole((user.access_roles[0] as AccessRole) || null);
      // Set the first cooperative role if available
      setSelectedCooperativeRole((user.cooperative_roles[0] as CooperativeRole) || null);
    }
  }, [user]);

  // Handle save action
  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      // Convert single selections back to arrays for the API
      const accessRoles = selectedAccessRole ? [selectedAccessRole] : [];
      const cooperativeRoles = selectedCooperativeRole ? [selectedCooperativeRole] : [];
      
      await onSave(accessRoles, cooperativeRoles);
      onClose();
    } catch (error) {
      console.error("Failed to update roles:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Edit User Roles
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {user.first_name} {user.last_name} ({user.email})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Access Roles Section */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Access Role
              </h3>
              <p className="text-sm text-muted-foreground">
                Select one system access level for this user
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACCESS_ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedAccessRole(role)}
                  className={`px-4 py-3 border rounded-lg text-left transition-all ${
                    selectedAccessRole === role
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="capitalize">{role}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedAccessRole === role
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}>
                      {selectedAccessRole === role && (
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cooperative Roles Section */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Cooperative Role
              </h3>
              <p className="text-sm text-muted-foreground">
                Select one cooperative position for this user
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COOPERATIVE_ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedCooperativeRole(role)}
                  className={`px-4 py-3 border rounded-lg text-left transition-all ${
                    selectedCooperativeRole === role
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="capitalize">{role}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedCooperativeRole === role
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}>
                      {selectedCooperativeRole === role && (
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}