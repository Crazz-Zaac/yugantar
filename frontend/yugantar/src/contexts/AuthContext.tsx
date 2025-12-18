import { createContext, useContext, useState, useEffect } from "react";
import { User } from "@/types/user";
import { apiClient } from "@/api/api";
import { ENV } from "@/config/env";
import {
  normalizeUser,
  UserForUI,
  denormalizeUser,
  EditableUserFields,
} from "@/utils/normalizeUser";

interface AuthContextType {
  user: UserForUI | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserForUI>;
  signup: (...args: any) => Promise<void>;
  logout: () => void;
  updateProfile: (data: EditableUserFields) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = ENV.API_BASE;
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserForUI | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;

      try {
        const res = await apiClient.get("/users/me");
        setUser(normalizeUser(res.data));
      } catch {
        localStorage.removeItem("access_token");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const signup = async (userData: Partial<UserForUI>, password: string) => {
    setIsLoading(true);
    try {
      const apiData = denormalizeUser(userData);
      const body = JSON.stringify({
        ...apiData,
        email: userData.email,
        password,
      });

      console.log("Signup request body:", body);

      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Signup error response:", errorData);

        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            console.error("Validation errors:", errorData.detail);
            const firstError = errorData.detail[0];
            throw new Error(firstError.msg || "Validation failed");
          }
          throw new Error(errorData.detail);
        }
        throw new Error("Failed to register");
      }

      const data = await res.json();
      console.log("Signup success response:", data);

      if (data.access_token && data.refresh_token) {
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        setUser(normalizeUser(data.user));
      } else if (data.user) {
        setUser(normalizeUser(data.user));
      } else {
        setUser(normalizeUser(data));
      }
    } catch (err) {
      console.error("Signup error:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<UserForUI> => {
    setIsLoading(true);
    try {
      const res = await apiClient.post("/users/login", {
        email,
        password,
      });

      const accessToken = res.data.token.access_token;
      localStorage.setItem("access_token", accessToken);

      apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

      const me = await apiClient.get("/users/me");
      const normalized_user = normalizeUser(me.data);
      setUser(normalized_user);
      return normalized_user;
    } catch (err) {
      console.error("Login error:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post("/users/logout");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.removeItem("access_token");
      setUser(null);
    }
  };

  const updateProfile = async (data: EditableUserFields) => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      throw new Error("No authentication token found");
    }

    // Debug: Log the token (first/last 10 chars only for security)
    console.log("Token exists, length:", token.length);
    console.log(
      "Token preview:",
      `${token.substring(0, 10)}...${token.substring(token.length - 10)}`
    );

    const apiData = denormalizeUser(data);
    console.log("Update profile request data:", apiData);

    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        credentials: "include", // Include credentials for cookie-based auth
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(apiData),
      });

      // Log response status
      console.log("Update profile response status:", res.status);

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Update profile error response:", errorData);

        // If unauthorized, token might be expired
        if (res.status === 401) {
          console.error("Token might be expired or invalid");
          // Optionally: trigger re-login
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          throw new Error("Session expired. Please log in again.");
        }

        throw new Error(errorData.detail || "Failed to update profile");
      }

      const updated: User = await res.json();
      console.log("Update profile success:", updated);
      setUser(normalizeUser(updated));
    } catch (err) {
      console.error("Update profile caught error:", err);
      throw err;
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ) => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      throw new Error("No authentication token found");
    }

    const res = await fetch(`${API_BASE}/users/me/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("Change password error:", errorData);
      throw new Error(errorData.detail || "Failed to change password");
    }

    const data = await res.json();
    console.log("Password changed successfully:", data);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
