import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MoonIcon, SunIcon } from "./icons";

export function Layout({
  children,
  onToggleDark,
  dark,
}: {
  children: React.ReactNode;
  onToggleDark: () => void;
  dark: boolean;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <nav className="nav">
        <Link className="brand" to="/projects">
          TaskFlow
        </Link>
        <div className="nav-actions">
          <span>{user?.name}</span>
          <button
            aria-label="Toggle dark mode"
            className="button secondary icon-btn"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={onToggleDark}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="button secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </nav>
      <main className="page">{children}</main>
    </div>
  );
}
