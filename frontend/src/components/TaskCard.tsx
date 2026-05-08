import React from "react";
import { TypeIcon } from "./TypeIcon";
import type { Task, User } from "../types";

interface TaskCardProps {
  task: Task;
  users: User[];
  onClick?: () => void;
  onStatusChange?: (task: Task, status: Task["status"]) => void;
  /** When true renders with grab cursor for dnd contexts */
  dragging?: boolean;
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

export const TaskCard = React.forwardRef<
  HTMLDivElement,
  TaskCardProps & React.HTMLAttributes<HTMLDivElement>
>(function TaskCard(
  { task, users, onClick, onStatusChange, dragging, style, className, ...rest },
  ref,
) {
  const assignee = users.find((u) => u.id === task.assignee_id);
  const overdue = isOverdue(task.due_date);

  return (
    <div
      ref={ref}
      className={`card task-card${dragging ? " task-card--dragging" : ""}${className ? " " + className : ""}`}
      style={{
        cursor: dragging ? "grabbing" : "grab",
        marginBottom: 8,
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
            className="muted"
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
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          {task.description || "No description."}
        </p>
      </div>

      {/* Priority + assignee pills */}
      <div className="row" style={{ marginTop: 8 }}>
        <span className={`pill priority-${task.priority}`}>
          {task.priority}
        </span>
        <span className="pill">{assignee?.name || "Unassigned"}</span>
      </div>

      {/* Due date */}
      {task.due_date && (
        <span
          className="muted"
          style={{ fontSize: 12, color: overdue ? "#b91c1c" : undefined }}
        >
          Due {task.due_date}
        </span>
      )}

      {/* Status dropdown */}
      {onStatusChange && (
        <div className="row" style={{ marginTop: 6 }}>
          <select
            value={task.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(task, e.target.value as Task["status"]);
            }}
            style={{ fontSize: 12 }}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      )}
    </div>
  );
});
