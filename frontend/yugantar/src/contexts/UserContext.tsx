import { createContext, useContext, useState } from "react";
import { getAllUsers, updateUserRolesApi } from "@/services/user.service";
import type { AccessRole, CooperativeRole } from "@/constants";
import {
  getUserById,
  updateUserById,
  deleteUserById,
  toggleUserDisabledStatus,
} from "@/services/user.service";

import {
  normalizeUser,
  denormalizeUser,
  UserForUI,
} from "@/utils/normalizeUser";

interface UserContextProps {
  users: UserForUI[];
  totalUsers: number;
  loading: boolean;
  error: string | null;
  fetchUsers: (skip: number, limit: number) => Promise<void>;
  updateUser: (userId: string, userData: Partial<UserForUI>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getUser: (userId: string) => Promise<UserForUI | null>;
  toggleUserStatus: (userId: string) => Promise<UserForUI | null>;
  updateUserRoles: (
    userId: string,
    accessRoles: AccessRole[],
    cooperativeRoles: CooperativeRole[]
  ) => Promise<void>;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

export const useUser = (): UserContextProps => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [users, setUsers] = useState<UserForUI[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async (skip: number = 0, limit: number = 10) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAllUsers(skip, limit);
      console.log("API Response:", response);
      console.log("Response type:", typeof response);
      console.log("Users array:", response.users);
      console.log("Total:", response.total);

      if (!response || !response.users) {
        throw new Error("Invalid response format from API");
      }

      const normalizedUsers = response.users.map(normalizeUser);
      console.log("Normalized users:", normalizedUsers);
      setUsers(normalizedUsers);
      setTotalUsers(response.total);
    } catch (err: any) {
      setError(err.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  // fetch single user by ID
  const getUser = async (userId: string): Promise<UserForUI | null> => {
    try {
      const user = await getUserById(userId);
      return normalizeUser(user);
    } catch (err) {
      setError("Failed to fetch user");
      return null;
    }
  };

  // update user by ID
  const updateUser = async (userId: string, userData: Partial<UserForUI>) => {
    try {
      const apiData = denormalizeUser(userData);
      const updatedUser = await updateUserById(userId, apiData);
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === userId ? normalizeUser(updatedUser) : user
        )
      );
    } catch (err) {
      setError("Failed to update user");
      throw err;
    }
  };

  // toggle user disabled status by ID
  const toggleUserStatus = async (
    userId: string
  ): Promise<UserForUI | null> => {
    try {
      const updatedUser = await toggleUserDisabledStatus(userId);
      const normalizedUser = normalizeUser(updatedUser);
      setUsers(prevUsers =>
        prevUsers.map(user => (user.id === userId ? normalizedUser : user))
      );
      return normalizedUser;
    } catch (err) {
      setError("Failed to toggle user disabled status");
      return null;
    }
  };

  // delete user by ID
  const deleteUser = async (userId: string) => {
    try {
      await deleteUserById(userId);
      setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
      setTotalUsers(prev => prev - 1);
    } catch (err) {
      setError("Failed to delete user");
      throw err;
    }
  };

  const updateUserRoles = async (
    userId: string,
    accessRoles: AccessRole[],
    cooperativeRoles: CooperativeRole[]
  ) => {
    try {
      const updatedUser = await updateUserRolesApi(
        userId,
        accessRoles,
        cooperativeRoles
      );
      const normalizedUser = normalizeUser(updatedUser);
      setUsers(prevUsers =>
        prevUsers.map(user => (user.id === userId ? normalizedUser : user))
      );
    } catch (err) {
      setError("Failed to update user roles");
      throw err;
    }
  };

  return (
    <UserContext.Provider
      value={{
        users,
        totalUsers,
        loading,
        error,
        fetchUsers,
        getUser,
        updateUser,
        deleteUser,
        toggleUserStatus,
        updateUserRoles,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
