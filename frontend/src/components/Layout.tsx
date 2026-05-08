import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <nav className="nav">
        <Link className="brand" to="/projects">
          HRS TaskFlow
        </Link>
        <div className="nav-actions">
          <span className="underline">{user?.name}</span>
          <button className="button secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </nav>
      <main className="page">{children}</main>
    </div>
  );
}
