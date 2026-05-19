import React, { createContext, useContext, useMemo, useState } from "react";
import { request } from "../api/client";
import type { AuthContextValue, User } from "../types";

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem("taskflow_token"),
  );
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("taskflow_user");
    return raw ? JSON.parse(raw) : null;
  });

  async function authenticate(path: string, body: unknown) {
    const data = await request<{ token: string; user: User }>(path, {
      method: "POST",
      body,
    });
    localStorage.setItem("taskflow_token", data.token);
    localStorage.setItem("taskflow_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  async function registerAccount(
    name: string,
    email: string,
    password: string,
  ) {
    await authenticate("/auth/register", { name, email, password });
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      login: (email, password) =>
        authenticate("/auth/login", { email, password }),
      register: registerAccount,
      logout: () => {
        localStorage.removeItem("taskflow_token");
        localStorage.removeItem("taskflow_user");
        setToken(null);
        setUser(null);
      },
      loginWithToken: (token: string, user: User) => {
        localStorage.setItem("taskflow_token", token);
        localStorage.setItem("taskflow_user", JSON.stringify(user));
        setToken(token);
        setUser(user);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
