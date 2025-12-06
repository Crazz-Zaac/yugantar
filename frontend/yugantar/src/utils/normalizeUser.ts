import { User } from "@/types/user";

export type UserForUI = {
  [K in keyof User]: string;
};

export function normalizeUser(user: User): UserForUI {
  return {
    ...user,
    first_name: user.first_name ?? "",
    middle_name: user?.middle_name ?? "",
    last_name: user.last_name ?? "",
    phone: user.phone ?? "",
    email: user.email ?? "",
    address: user.address ?? "",
    gender: user?.gender ?? "other",
    date_of_birth: user.date_of_birth ?? "",
    // Convert other fields to strings
    id: user.id ?? "",
    is_verified: String(user.is_verified),
    disabled: String(user.disabled),
    access_roles: user.access_roles.join(","),
    cooperative_roles: user.cooperative_roles.join(","),
    joined_at: user.joined_at ?? "",
    created_at: user.created_at ?? "",
    updated_at: user.updated_at ?? "",
  };
}

// Convert UI data back to API format (for updates)
export function denormalizeUser(userForUI: Partial<UserForUI>): Partial<User> {
  const apiData: Partial<User> = {};

  // Only include fields that are being updated
  if (userForUI.first_name !== undefined) apiData.first_name = userForUI.first_name;
  if (userForUI.middle_name !== undefined) apiData.middle_name = userForUI.middle_name || null;
  if (userForUI.last_name !== undefined) apiData.last_name = userForUI.last_name;
  if (userForUI.phone !== undefined) apiData.phone = userForUI.phone;
  if (userForUI.address !== undefined) apiData.address = userForUI.address;
  if (userForUI.date_of_birth !== undefined) apiData.date_of_birth = userForUI.date_of_birth || null;
  if (userForUI.gender !== undefined) apiData.gender = userForUI.gender as "male" | "female" | "other";

  return apiData;
}

// Helper to get editable fields from user
export function getEditableFields(user: UserForUI | null) {
  // Convert date from ISO format (1997-06-09T00:00:00) to HTML date input format (1997-06-09)
  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return "";
    // Extract just the date part (yyyy-MM-dd) from ISO string
    return dateStr.split("T")[0];
  };

  return {
    first_name: user?.first_name || "",
    middle_name: user?.middle_name || "",
    last_name: user?.last_name || "",
    phone: user?.phone || "",
    address: user?.address || "",
    date_of_birth: formatDateForInput(user?.date_of_birth || ""),
    gender: user?.gender || "other",
  };
}

// Type for editable fields
export type EditableUserFields = ReturnType<typeof getEditableFields>;