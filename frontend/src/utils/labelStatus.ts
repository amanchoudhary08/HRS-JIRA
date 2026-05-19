import type { Task } from "../types";

export function labelStatus(status: Task["status"]) {
  const labels: Record<Task["status"], string> = {
    todo: "Todo",
    in_progress: "In Progress",
    blocked: "Blocked",
    in_review: "In Review",
    done: "Done",
  };
  return labels[status] ?? status;
}
