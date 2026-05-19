import React from "react";
import { TypeIcon } from "./TypeIcon";
import { LabelChip } from "./LabelChip";
import type { Task, User } from "../types";
import * as cx from "../styles/classes";

interface TaskCardProps {
  task: Task;
  users: User[];
  attachmentCount?: number;
  onClick?: () => void;
  onStatusChange?: (task: Task, status: Task["status"]) => void;
  /** When true renders with grab cursor for dnd contexts */
  dragging?: boolean;
}

export const TaskCard = React.forwardRef<
  HTMLDivElement,
  TaskCardProps & React.HTMLAttributes<HTMLDivElement>
>(function TaskCard(
  {
    task,
    users,
    attachmentCount,
    onClick,
    onStatusChange,
    dragging,
    style,
    className,
    ...rest
  },
  ref,
) {
  const assignee = users.find((u) => u.id === task.assignee_id);

  function initials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return (
    <div
      ref={ref}
      className={`${cx.taskCard}${className ? " " + className : ""}`}
      style={{
        cursor: dragging ? "grabbing" : "grab",
        marginBottom: 8,
        opacity: dragging ? 0.7 : 1,
        ...style,
      }}
      onClick={onClick}
      {...rest}
    >
      {/* Header: type icon + short ID + title */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <TypeIcon
            type={task.type ?? "task"}
            size={14}
            style={{ flexShrink: 0 }}
          />
          <span
            className="text-text-muted"
            style={{
              fontSize: "0.75rem",
              fontFamily: "monospace",
              flexShrink: 0,
            }}
          >
            #{task.id.slice(0, 8)}
          </span>
          <h3 style={{ margin: 0, fontSize: 14 }}>{task.title}</h3>
        </div>
        <p
          className="text-text-muted"
          style={{ margin: "4px 0 0", fontSize: 13 }}
        >
          {task.description || "No description."}
        </p>
      </div>

      {/* Priority + assignee pills */}
      <div className={cx.row} style={{ marginTop: 8 }}>
        <span className={cx.priorityClass(task.priority)}>{task.priority}</span>
        {task.story_points != null && (
          <span className="text-text-muted" style={{ fontSize: "0.75rem" }}>
            {task.story_points} pts
          </span>
        )}
        <span className={cx.pill}>
          {assignee ? initials(assignee.name) : "?"}
        </span>
        {attachmentCount != null && attachmentCount > 0 && (
          <span
            title={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            📎{attachmentCount}
          </span>
        )}
      </div>

      {/* Label chips */}
      {task.labels && task.labels.length > 0 && (
        <div
          className={cx.row}
          style={{ marginTop: 4, flexWrap: "wrap", gap: 4 }}
        >
          {task.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
    </div>
  );
});
