import { createContext, useContext, useState, useEffect } from "react";
import { User } from "@/types/user";
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
  login: (email: string, password: string) => Promise<void>;
  signup: (...args: any) => Promise<void>;
  logout: () => void;
  updateProfile: (data: EditableUserFields) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = import.meta.env.VITE_API_BASE;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserForUI | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (token) {
          const res = await fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data: User = await res.json();
            setUser(normalizeUser(data));
          } else {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            setUser(null);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const updateProfile = async (data: EditableUserFields) => {
    const token = localStorage.getItem("access_token");

    // Convert UI data to API format
    const apiData = denormalizeUser(data);

    const res = await fetch(`${API_BASE}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(apiData),
    });

    if (!res.ok) throw new Error("Failed to update profile");

    const updated: User = await res.json();
    setUser(normalizeUser(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login: async () => {}, // login
        signup: async () => {}, // signup
        logout: async () => {}, // logout
        updateProfile, // updateProfile
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
