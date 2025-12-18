import { authFetch } from "@/lib/http";
import { use } from "react";

export interface PaginatedUsersResponse {
  users: any[];
  total: number;
  skip: number;
  limit: number;
}

// Fetch all users with pagination (admin only)
export const getAllUsers = async (skip: number = 0, limit: number = 10): Promise<PaginatedUsersResponse> => {
  const response = await authFetch(`/admin/users?skip=${skip}&limit=${limit}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }

  return response.json();
};

// Fetch user by ID (admin only)
export const getUserById = async (userId: string) => {
  const response = await authFetch(`/admin/users/${userId}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }

  return response.json();
};

// Update user by ID (admin only)
export const updateUserById = async (userId: string, userData: Partial<any>) => {
  const response = await authFetch(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    throw new Error("Failed to update user");
  }

  return response.json();
};

// Delete user by ID (admin only)
export const deleteUserById = async (userId: string) => {
  const response = await authFetch(`/admin/users/${userId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete user");
  }

  return response.json();
}

// Toggle user disabled status by ID (admin only)
export const toggleUserDisabledStatus = async (userId: string) => {
  const response = await authFetch(`/admin/users/${userId}/toggle-disabled`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to toggle user disabled status");
  }

  return response.json();
}

// update user's roles by ID (admin only)
export const updateUserRolesApi = async (
  userId: string,
  accessRoles: string[],
  cooperativeRoles: string[]
) => {
  const response = await authFetch(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ access_roles: accessRoles, cooperative_roles: cooperativeRoles }),
  });

  if (!response.ok) {
    throw new Error("Failed to update user roles");
  }

  return response.json();
}