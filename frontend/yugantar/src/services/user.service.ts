
import { ENV } from "@/config/env";

const API_BASE = ENV.API_BASE;

// Fetch all users (Admin only)
export const getAllUsers = async (token: string) => {
  const res = await fetch(`${API_BASE}/admin/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }

  return res.json();
};

// Fetch user by ID (Admin only)
export const getUserById = async (userId: string, token: string) => {
  const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
    headers: {
        Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch user");
  }

  return res.json();
};
