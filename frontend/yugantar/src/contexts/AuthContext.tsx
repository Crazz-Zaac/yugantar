import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getLang, t } from "@/lib/i18n";
import {
  apiClient,
  SESSION_EXPIRED_EVENT,
  broadcastAuth,
  onAuthBroadcast,
  refreshAccessToken,
  setAccessToken,
} from "@/api/api";
import { ENV } from "@/config/env";
import {
  normalizeUser,
  UserForUI,
  denormalizeUser,
} from "@/utils/normalizeUser";

interface AuthContextType {
  user: UserForUI | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserForUI>;
  signup: (...args: any) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<UserForUI>) => Promise<void>;
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

  // Restore the session on page load: the access token lives only in memory,
  // so get a new one with the httpOnly refresh cookie (if there is a session).
  const restoreSession = useCallback(async () => {
    try {
      await refreshAccessToken();
      const res = await apiClient.get("/users/me");
      setUser(normalizeUser(res.data));
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Tokens used to be kept in localStorage; remove any left behind
    localStorage.removeItem("access_token");
    restoreSession();
  }, [restoreSession]);

  // Keep tabs in sync: logging out in one tab logs out all of them, and
  // logging in picks up the new session in the others.
  useEffect(
    () =>
      onAuthBroadcast((message) => {
        if (message.type === "logout") {
          setAccessToken(null);
          setUser(null);
        } else if (message.type === "login") {
          restoreSession();
        }
      }),
    [restoreSession]
  );

  const signup = async (userData: Partial<UserForUI>, password: string) => {
    setIsLoading(true);
    try {
      const apiData = denormalizeUser(userData);
      const body = JSON.stringify({
        ...apiData,
        email: userData.email,
        password,
        // Emails (e.g. the verification link) in the language chosen on the page
        preferred_language: getLang(),
      });


      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Language": getLang() },
        body,
      });

      if (!res.ok) {
        const errorData = await res.json();

        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            const firstError = errorData.detail[0];
            throw new Error(firstError.msg || t("Validation failed"));
          }
          throw new Error(errorData.detail);
        }
        throw new Error(t("Failed to register"));
      }

      // A new account can't sign in yet: the email must be verified and an
      // administrator must approve it. So we don't set a user here.
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

      // Access token in memory only; the refresh token is an httpOnly cookie
      setAccessToken(res.data.token.access_token);

      const me = await apiClient.get("/users/me");
      const normalized_user = normalizeUser(me.data);
      setUser(normalized_user);
      broadcastAuth({ type: "login" });
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
      setAccessToken(null);
      setUser(null);
      broadcastAuth({ type: "logout" });
    }
  };

  const updateProfile = async (data: Partial<UserForUI>) => {
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
