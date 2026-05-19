import React from "react";
import type { ActivityEvent } from "../types";
import { labelStatus } from "../utils/labelStatus";
import * as cx from "../styles/classes";

// ─── Human-readable messages per event type ──────────────────────────────────

function formatMessage(event: ActivityEvent): string {
  const { type, payload, actor_name } = event;
  const title = payload.title ? `"${payload.title}"` : "a task";
  switch (type) {
    case "task_created":
      return `${actor_name} created ${payload.type ?? "task"} ${title}`;
    case "subtask_created":
      return `${actor_name} added subtask ${title}`;
    case "task_updated":
      return `${actor_name} updated ${title}`;
    case "task_deleted":
      return `${actor_name} deleted task ${title}`;
    case "status_changed":
      return `${actor_name} changed status of ${title} from ${labelStatus((payload.from ?? "") as "todo" | "in_progress" | "done")} to ${labelStatus((payload.to ?? "") as "todo" | "in_progress" | "done")}`;
    case "priority_changed":
      return `${actor_name} changed priority of ${title} from ${payload.from} to ${payload.to}`;
    case "type_changed":
      return `${actor_name} changed type of ${title} from ${payload.from} to ${payload.to}`;
    case "title_changed":
      return `${actor_name} renamed task from "${payload.from}" to "${payload.to}"`;
    case "assignee_changed":
      return `${actor_name} changed assignee of ${title} from ${payload.from} to ${payload.to}`;
    case "due_date_changed":
      return `${actor_name} changed due date of ${title} from ${payload.from} to ${payload.to}`;
    case "sprint_changed":
      return `${actor_name} moved ${title} from ${payload.from} to ${payload.to}`;
    case "task_moved": {
      const statusLabel: Record<string, string> = {
        todo: "To Do",
        in_progress: "In Progress",
        done: "Done",
      };
      return `${actor_name} moved ${title} to ${statusLabel[payload.status ?? ""] ?? payload.status}`;
    }
    case "comment_added":
      return `${actor_name} commented on ${payload.taskTitle ? `"${payload.taskTitle}"` : "a task"}`;
    case "comment_deleted":
      return `${actor_name} deleted a comment`;
    case "sprint_started":
      return `${actor_name} started sprint "${payload.sprintName ?? ""}"`;
    case "sprint_completed":
      return `${actor_name} completed sprint "${payload.sprintName ?? ""}"`;
    case "member_added":
      return `${actor_name} added ${payload.userName ?? "a member"} as ${payload.role}`;
    case "member_removed":
      return `${actor_name} removed ${payload.userName ?? "a member"}`;
    case "role_changed":
      return `${actor_name} changed ${payload.userName ?? "a member"}'s role to ${payload.role}`;
    default:
      return `${actor_name} performed ${type}`;
  }
}

// ─── Icon per event type ──────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  const iconStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    flexShrink: 0,
  };

  if (type === "task_created" || type === "subtask_created")
    return (
      <span style={{ ...iconStyle, background: "#d1fae5", color: "#065f46" }}>
        ✚
      </span>
    );
  if (type === "task_deleted")
    return (
      <span style={{ ...iconStyle, background: "#fee2e2", color: "#991b1b" }}>
        ✕
      </span>
    );
  if (type === "status_changed" || type === "task_moved")
    return (
      <span style={{ ...iconStyle, background: "#e0f2fe", color: "#0369a1" }}>
        ↔
      </span>
    );
  if (type === "priority_changed")
    return (
      <span style={{ ...iconStyle, background: "#fef3c7", color: "#92400e" }}>
        !
      </span>
    );
  if (type === "type_changed")
    return (
      <span style={{ ...iconStyle, background: "#ede9fe", color: "#5b21b6" }}>
        ⬡
      </span>
    );
  if (type === "assignee_changed")
    return (
      <span style={{ ...iconStyle, background: "#f0fdf4", color: "#166534" }}>
        👤
      </span>
    );
  if (type === "due_date_changed")
    return (
      <span style={{ ...iconStyle, background: "#fff7ed", color: "#9a3412" }}>
        📅
      </span>
    );
  if (type === "sprint_changed")
    return (
      <span style={{ ...iconStyle, background: "#fef9c3", color: "#854d0e" }}>
        ⚡
      </span>
    );
  if (type === "title_changed" || type === "task_updated")
    return (
      <span style={{ ...iconStyle, background: "#e0f2fe", color: "#0369a1" }}>
        ✏
      </span>
    );
  if (type.startsWith("comment"))
    return (
      <span style={{ ...iconStyle, background: "#ede9fe", color: "#5b21b6" }}>
        💬
      </span>
    );
  if (type.startsWith("sprint"))
    return (
      <span style={{ ...iconStyle, background: "#fef9c3", color: "#854d0e" }}>
        ⚡
      </span>
    );
  if (type.startsWith("member") || type === "role_changed")
    return (
      <span style={{ ...iconStyle, background: "#f0fdf4", color: "#166534" }}>
        👤
      </span>
    );
  return (
    <span
      style={{
        ...iconStyle,
        background: "var(--pill-bg)",
        color: "var(--text-muted)",
      }}
    >
      •
    </span>
  );
}

// ─── Time ago helper ──────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  // Older than 24h — show full date + time
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  events: ActivityEvent[];
  loading?: boolean;
}

export function ActivityFeed({ events, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className={`${cx.empty} text-[0.85rem]`}>Loading activity...</div>
    );
  }
  if (events.length === 0) {
    return <div className={`${cx.empty} text-[0.85rem]`}>No activity yet.</div>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2.5 py-2 border-b border-border"
        >
          <EventIcon type={event.type} />
          <div className="flex-1 min-w-0">
            <p className="m-0 text-[0.85rem] text-text leading-[1.4]">
              {formatMessage(event)}
            </p>
            <span className="text-[0.75rem] text-text-muted">
              {timeAgo(event.created_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
