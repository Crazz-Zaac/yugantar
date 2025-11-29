import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    firstname: string,
    middlename: string,
    lastname: string,
    phonenumber: string,
    address: string,
    gender: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = import.meta.env.VITE_API_BASE;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (token) {
          const response = await fetch(`${API_BASE}/users/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data);
          } else {
            // Token invalid or expired
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            setUser(null);
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Login failed");
      }

      const data = await response.json();

      localStorage.setItem("access_token", data.token.access_token);
      localStorage.setItem("refresh_token", data.token.refresh_token);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    firstname: string,
    middlename: string,
    lastname: string,
    phonenumber: string,
    address: string,
    gender: string
  ) => {
    setIsLoading(true);
    try {
      const requestBody = {
        email,
        password,
        first_name: firstname,
        middle_name: middlename || null,
        last_name: lastname,
        phone: phonenumber,
        address: address || "Not provided",
        gender: gender.toLowerCase(),
      };
      
      console.log('Signup request body:', requestBody);

      const response = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('Signup error response:', err);
        
        if (err.detail && Array.isArray(err.detail)) {
          console.error('Validation errors:');
          err.detail.forEach((error: any, index: number) => {
            console.error(`Error ${index + 1}:`, error);
          });
        }
        
        throw new Error(err.detail || JSON.stringify(err) || "Signup failed");
      }

      const data = await response.json();
      console.log('Signup success response:', data);
      console.log('Full response structure:', JSON.stringify(data, null, 2)); // ✅ Log full structure

      // ✅ Check if the response has the expected structure
      if (data.token && data.token.access_token) {
        localStorage.setItem("access_token", data.token.access_token);
        localStorage.setItem("refresh_token", data.token.refresh_token);
        setUser(data.user);
      } else if (data.access_token) {
        // Maybe tokens are at root level?
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        setUser(data);
      } else {
        console.error('Unexpected response structure:', data);
        throw new Error('Invalid response structure from server');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem("access_token");

    await fetch(`${API_BASE}/users/logout`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
