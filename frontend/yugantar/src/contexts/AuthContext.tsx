import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient, SESSION_EXPIRED_EVENT } from "@/api/api";
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

  // Handle session-expired event fired by the 401 interceptor
  const handleSessionExpired = useCallback(() => {
    setUser(null);
    // Token is already removed by the interceptor
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [handleSessionExpired]);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;

      try {
        // If the access token is expired, the 401 interceptor will
        // automatically call /auth/refresh and retry this request.
        // We only land in catch if refresh also fails.
        const res = await apiClient.get("/users/me");
        setUser(normalizeUser(res.data));
      } catch {
        // Refresh failed too - clear everything
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

      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        // Refresh token is delivered via httpOnly cookie — never store in localStorage
        setUser(normalizeUser(data.user ?? data));
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
    const apiData = denormalizeUser(data);

    try {
      const res = await apiClient.patch("/users/me", apiData);
      setUser(normalizeUser(res.data));
    } catch (err) {
      console.error("Update profile error:", err);
      throw err;
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ) => {
    try {
      await apiClient.post("/users/me/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
    } catch (err) {
      console.error("Change password error:", err);
      throw err;
    }
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
