import React from "react";
import type { Task } from "../types";

type TaskType = Task["type"];

const TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  bug: "Bug",
  story: "Story",
  epic: "Epic",
};

/** Small inline SVG icon representing a task type. Hovering shows a tooltip. */
export function TypeIcon({
  type,
  size = 14,
  style: extraStyle,
}: {
  type: TaskType;
  size?: number;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    flexShrink: 0,
    pointerEvents: "none",
    ...extraStyle,
  };
  const label = TYPE_LABEL[type] ?? "Task";

  function icon() {
    switch (type) {
      case "bug":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            aria-label={label}
            style={base}
          >
            <circle cx="8" cy="9" r="4.5" fill="#ef4444" />
            <path
              d="M6 4.5C6 3.67 6.9 3 8 3s2 .67 2 1.5"
              stroke="#ef4444"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <line
              x1="8"
              y1="4.5"
              x2="8"
              y2="6.5"
              stroke="#fff"
              strokeWidth="1.2"
            />
            <line
              x1="3.5"
              y1="7"
              x2="5.5"
              y2="8"
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1="10.5"
              y1="8"
              x2="12.5"
              y2="7"
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1="3.5"
              y1="11"
              x2="5.5"
              y2="10"
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1="10.5"
              y1="10"
              x2="12.5"
              y2="11"
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        );
      case "story":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            aria-label={label}
            style={base}
          >
            <path
              d="M3 2h10v12L8 11 3 14V2z"
              fill="#22c55e"
              stroke="#16a34a"
              strokeWidth="1"
            />
          </svg>
        );
      case "epic":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            aria-label={label}
            style={base}
          >
            <path
              d="M9 2L4 9h4.5L7 14l5-7H8L9 2z"
              fill="#a855f7"
              stroke="#9333ea"
              strokeWidth="0.5"
            />
          </svg>
        );
      default:
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            aria-label={label}
            style={base}
          >
            <rect
              x="1.5"
              y="1.5"
              width="13"
              height="13"
              rx="3"
              fill="#3b82f6"
            />
            <path
              d="M4.5 8.5l2.5 2.5 4.5-5"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
    }
  }

  return (
    <span
      data-tooltip={label}
      className="type-icon"
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      {icon()}
    </span>
  );
}
