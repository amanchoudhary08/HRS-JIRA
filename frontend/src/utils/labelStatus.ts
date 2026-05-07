import type { Task } from "../types";

export function labelStatus(status: Task["status"]) {
  return status === "in_progress"
    ? "In progress"
    : status === "todo"
      ? "Todo"
      : "Done";
}
