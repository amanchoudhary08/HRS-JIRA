import React, { FormEvent, useEffect, useState } from "react";
import { request } from "../api/client";
import { Field } from "./Field";
import type { Task, User } from "../types";

export function TaskModal({
  projectId,
  token,
  task,
  users,
  currentUser,
  onClose,
  onSaved,
}: {
  projectId: string;
  token: string | null;
  task: Task | null;
  users: User[];
  currentUser: User | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "todo");
  const [priority, setPriority] = useState<Task["priority"]>(
    task?.priority ?? "medium",
  );
  const [assignee, setAssignee] = useState(
    task ? (task.assignee_id ?? "") : (currentUser?.id ?? ""),
  );
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync all fields whenever the task prop changes (e.g. after a save that
  // clears the assignee — useState initialisers only run on first mount).
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setAssignee(task ? (task.assignee_id ?? "") : (currentUser?.id ?? ""));
    setDueDate(task?.due_date ?? "");
    setError("");
  }, [task]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    try {
      const body = {
        title,
        description,
        status,
        priority,
        assignee_id: assignee || "",
        due_date: dueDate || "",
      };
      const saved = task
        ? await request<Task>(`/projects/${projectId}/tasks/${task.id}`, {
            method: "PATCH",
            token,
            body,
          })
        : await request<Task>(`/projects/${projectId}/tasks`, {
            method: "POST",
            token,
            body,
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="card modal stack" onSubmit={submit}>
        <div className="toolbar">
          <h2 className="title">{task ? "Edit task" : "New task"}</h2>
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Task["status"])}
            >
              <option value="todo">Todo</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Assignee">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <button className="button" disabled={saving}>
          {saving ? "Saving..." : "Save task"}
        </button>
      </form>
    </div>
  );
}
