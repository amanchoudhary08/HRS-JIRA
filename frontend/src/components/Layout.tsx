import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { globalSearch } from "../api/client";
import type { SearchResult, Task } from "../types";
import { TypeIcon } from "./TypeIcon";
import { NotificationBell } from "./NotificationBell";
import * as cx from "../styles/classes";

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className={cx.searchHighlight}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function Layout({
  children,
  sidebar,
  backTo,
  backLabel = "← Back to projects",
}: {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced search — fires 300 ms after the user stops typing
  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await globalSearch(query.trim(), token);
        setResults(data.results);
        setShowDropdown(true);
      } catch {
        // ignore network errors
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleTaskClick(task: Task, projectId: string) {
    setShowDropdown(false);
    setQuery("");
    navigate(`/projects/${projectId}`);
  }

  const totalHits = results.reduce((s, r) => s + r.tasks.length, 0);

  return (
    <div className={cx.shell}>
      <nav className={cx.nav}>
        <Link className={cx.brand} to="/projects">
          HRS TaskFlow
        </Link>

        {/* ── Global search bar ── */}
        <div className={cx.searchWrapper} ref={searchRef}>
          <input
            className={cx.searchInput}
            type="search"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            aria-label="Search tasks"
          />
          {showDropdown && (
            <div className={cx.searchDropdown} role="listbox">
              {searching && <div className={cx.searchEmpty}>Searching…</div>}
              {!searching && totalHits === 0 && (
                <div className={cx.searchEmpty}>No results for "{query}"</div>
              )}
              {!searching &&
                results.map((group) => (
                  <div key={group.project_id} className={cx.searchGroup}>
                    <div className={cx.searchGroupHeader}>
                      {group.project_name}
                    </div>
                    {group.tasks.map((task) => (
                      <button
                        key={task.id}
                        className={cx.searchItem}
                        role="option"
                        onClick={() => handleTaskClick(task, group.project_id)}
                      >
                        <TypeIcon type={task.type} size={13} />
                        <span className={cx.searchItemTitle}>
                          {highlight(task.title, query)}
                        </span>
                        <span
                          className={cx.priorityClass(task.priority)}
                          style={{ fontSize: "0.7rem", marginLeft: "auto" }}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className={cx.navActions}>
          {token && <NotificationBell token={token} />}
          <span className="underline">{user?.name}</span>
          <button className={cx.btnSecondary} onClick={logout}>
            Logout
          </button>
        </div>
      </nav>
      {sidebar ? (
        <div className={cx.shellBody}>
          <aside className={cx.appSidebar}>{sidebar}</aside>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {backTo && (
              <div className={cx.pageBackBar}>
                <Link to={backTo} className={cx.pageBackLink}>
                  {backLabel}
                </Link>
              </div>
            )}
            <main className={cx.pageSidebar}>{children}</main>
          </div>
        </div>
      ) : (
        <main className={cx.page}>{children}</main>
      )}
    </div>
  );
}
