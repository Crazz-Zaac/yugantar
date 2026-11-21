import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getLang, t } from "@/lib/i18n";
import {
  apiClient,
  SESSION_EXPIRED_EVENT,
  broadcastAuth,
  loginStep1,
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

// Sign-in is two steps: after the password check the user must complete MFA
// (every account has it). `login` returns which MFA step to show; `finishLogin`
// turns the access token from that step into an active session.
export type LoginOutcome =
  | { kind: "authenticated"; user: UserForUI }
  | { kind: "mfa"; mode: "challenge" | "setup"; mfaToken: string };

interface AuthContextType {
  user: UserForUI | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  finishLogin: (accessToken: string) => Promise<UserForUI>;
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
      onAuthBroadcast(message => {
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
        headers: {
          "Content-Type": "application/json",
          "X-Language": getLang(),
        },
        body,
      });

      if (!res.ok) {
        const errorData = await res.json();

        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // e.g. {loc: ["body", "phone"], msg: "Value error, ..."} -> "phone: ..."
            const firstError = errorData.detail[0];
            const field = String(
              firstError.loc?.[firstError.loc.length - 1] ?? ""
            ).replace(/_/g, " ");
            const msg = String(
              firstError.msg || t("Validation failed")
            ).replace(/^Value error, /, "");
            throw new Error(
              field && field !== "body" ? `${field}: ${msg}` : msg
            );
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

  // Step 1: verify the password. MFA is required for everyone, so this returns
  // which second-factor step to show; no session starts until finishLogin().
  const login = async (
    email: string,
    password: string
  ): Promise<LoginOutcome> => {
    setIsLoading(true);
    try {
      const data = await loginStep1(email, password);
      if (data.mfa_setup_required) {
        return { kind: "mfa", mode: "setup", mfaToken: data.mfa_token };
      }
      if (data.mfa_required) {
        return { kind: "mfa", mode: "challenge", mfaToken: data.mfa_token };
      }
      // Fallback (MFA disabled server-side): a direct access token.
      const user = await finishLogin(data.access_token);
      return { kind: "authenticated", user };
    } catch (err) {
      console.error("Login error:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: turn the access token from the completed MFA step into a session.
  const finishLogin = async (accessToken: string): Promise<UserForUI> => {
    // Access token in memory only; the refresh token is an httpOnly cookie
    setAccessToken(accessToken);
    const me = await apiClient.get("/users/me");
    const normalized_user = normalizeUser(me.data);
    setUser(normalized_user);
    broadcastAuth({ type: "login" });
    return normalized_user;
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
        finishLogin,
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
