import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchNotificationCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/client";
import { API_URL } from "../api/client";
import type { Notification } from "../types";

// ── Simple "time ago" formatter ───────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMessage(n: Notification): string {
  const p = n.payload;
  if (n.type === "task_assigned") {
    return `${p.assignedBy ?? "Someone"} assigned you task "${p.taskTitle ?? "unknown"}"`;
  }
  if (n.type === "comment_added") {
    return `${p.commentBy ?? "Someone"} commented on "${p.taskTitle ?? "unknown"}"`;
  }
  return `New notification: ${n.type}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
interface ToastItem {
  id: string;
  message: string;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-brand)",
        borderRadius: 10,
        padding: "12px 18px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        maxWidth: 320,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        fontSize: "0.875rem",
        color: "var(--color-text)",
        animation: "slideUp 0.2s ease",
      }}
    >
      <span style={{ fontSize: "1.1rem" }}>🔔</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-muted)",
          padding: 0,
          fontSize: "1rem",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function NotificationBell({ token }: { token: string }) {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Poll count every 30 seconds
  const refreshCount = useCallback(async () => {
    try {
      const data = await fetchNotificationCount(token);
      setUnread(data.unread);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // SSE personal channel — live push
  useEffect(() => {
    const es = new EventSource(
      `${API_URL}/notifications/events?token=${encodeURIComponent(token)}`,
    );
    eventSourceRef.current = es;

    es.addEventListener("notification", (e) => {
      const data: Notification = JSON.parse((e as MessageEvent).data);
      setUnread((prev) => prev + 1);
      // Prepend to panel list if open
      setNotifications((prev) => [data, ...prev]);
      // Show toast
      const msg = formatMessage(data);
      const toastId = data.id;
      setToasts((prev) => [...prev, { id: toastId, message: msg }]);
    });

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [token]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  async function handleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && notifications.length === 0) {
      setLoading(true);
      try {
        const data = await fetchNotifications(token);
        setNotifications(data.notifications);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMarkRead(n: Notification) {
    if (n.read) {
      // Just navigate
      navigateToItem(n);
      return;
    }
    try {
      const updated = await markNotificationRead(n.id, token);
      setNotifications((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
    navigateToItem(n);
  }

  function navigateToItem(n: Notification) {
    const projectId = n.payload.projectId;
    if (projectId) navigate(`/projects/${projectId}`);
    setOpen(false);
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <>
      {/* Bell button */}
      <div ref={panelRef} style={{ position: "relative" }}>
        <button
          onClick={handleOpen}
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 6px",
            position: "relative",
            color: "var(--color-text)",
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 6,
          }}
        >
          {/* Bell SVG */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                background: "#ef4444",
                color: "#fff",
                borderRadius: 999,
                fontSize: "0.65rem",
                fontWeight: 700,
                minWidth: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
                lineHeight: 1,
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 340,
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              boxShadow: "0 4px 24px rgba(0,0,0,0.16)",
              zIndex: 300,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                Notifications
              </span>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-brand)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {loading && (
                <div
                  style={{
                    padding: "16px",
                    color: "var(--color-text-muted)",
                    fontSize: "0.85rem",
                    textAlign: "center",
                  }}
                >
                  Loading…
                </div>
              )}
              {!loading && notifications.length === 0 && (
                <div
                  style={{
                    padding: "24px 16px",
                    color: "var(--color-text-muted)",
                    fontSize: "0.85rem",
                    textAlign: "center",
                  }}
                >
                  No notifications yet.
                </div>
              )}
              {!loading &&
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      width: "100%",
                      padding: "12px 16px",
                      background: n.read ? "transparent" : "var(--color-bg)",
                      border: "none",
                      borderBottom: "1px solid var(--color-border)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                  >
                    {/* Icon */}
                    <span
                      style={{
                        fontSize: "1.1rem",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {n.type === "task_assigned" ? "📋" : "💬"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--color-text)",
                          fontWeight: n.read ? 400 : 600,
                          lineHeight: 1.4,
                        }}
                      >
                        {formatMessage(n)}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-muted)",
                          marginTop: 3,
                        }}
                      >
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    {!n.read && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--color-brand)",
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast stack */}
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          onClose={() => dismissToast(t.id)}
        />
      ))}
    </>
  );
}
