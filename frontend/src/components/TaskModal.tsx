import React, { FormEvent, useEffect, useRef, useState } from "react";
import { request } from "../api/client";
import { Field } from "./Field";
import { TypeIcon } from "./TypeIcon";
import { ActivityFeed } from "./ActivityFeed";
import { labelStatus } from "../utils/labelStatus";
import type {
  ActivityEvent,
  Comment,
  Sprint,
  SSETaskEvent,
  Task,
  User,
} from "../types";

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TaskModal({
  projectId,
  token,
  task,
  users,
  sprints = [],
  currentUser,
  commentEvent,
  canEdit = true,
  onClose,
  onSaved,
  onOpenTask,
}: {
  projectId: string;
  token: string | null;
  task: Task | null;
  users: User[];
  sprints?: Sprint[];
  currentUser: User | null;
  commentEvent?: SSETaskEvent | null;
  canEdit?: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onOpenTask?: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "todo");
  const [priority, setPriority] = useState<Task["priority"]>(
    task?.priority ?? "medium",
  );
  const [taskType, setTaskType] = useState<Task["type"]>(task?.type ?? "task");
  const [assignee, setAssignee] = useState(
    task ? (task.assignee_id ?? "") : (currentUser?.id ?? ""),
  );
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [sprintId, setSprintId] = useState(task?.sprint_id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Subtask state
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [savingSubtask, setSavingSubtask] = useState(false);

  // Parent task (for breadcrumb)
  const [parentTask, setParentTask] = useState<Task | null>(null);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Activity state
  const [taskActivity, setTaskActivity] = useState<ActivityEvent[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Sync all fields whenever the task prop changes
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setTaskType(task?.type ?? "task");
    setAssignee(task ? (task.assignee_id ?? "") : (currentUser?.id ?? ""));
    setDueDate(task?.due_date ?? "");
    setSprintId(task?.sprint_id ?? "");
    setError("");
    setSubtasks([]);
    setParentTask(null);
    setShowSubtaskForm(false);
  }, [task?.id]);

  // Load comments + subtasks + parent when a task is opened
  useEffect(() => {
    if (!task) {
      setComments([]);
      setTaskActivity([]);
      return;
    }
    setLoadingComments(true);
    request<{ comments: Comment[] }>(
      `/projects/${projectId}/tasks/${task.id}/comments`,
      { token },
    )
      .then((data) => setComments(data.comments))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));

    // Load task activity
    setLoadingActivity(true);
    request<{ activity: ActivityEvent[] }>(
      `/projects/${projectId}/tasks/${task.id}/activity`,
      { token },
    )
      .then((data) => setTaskActivity(data.activity))
      .catch(() => setTaskActivity([]))
      .finally(() => setLoadingActivity(false));

    // Only load subtasks if this task is NOT itself a subtask
    if (!task.parent_id) {
      setLoadingSubtasks(true);
      request<{ subtasks: Task[] }>(
        `/projects/${projectId}/tasks/${task.id}/subtasks`,
        { token },
      )
        .then((data) => setSubtasks(data.subtasks))
        .catch(() => setSubtasks([]))
        .finally(() => setLoadingSubtasks(false));
    }

    // Load parent task for breadcrumb
    if (task.parent_id) {
      request<Task>(`/projects/${projectId}/tasks/${task.parent_id}`, { token })
        .then((p) => setParentTask(p))
        .catch(() => setParentTask(null));
    }
  }, [task?.id]);

  // Handle live SSE comment events
  useEffect(() => {
    if (!commentEvent || !task) return;
    if (commentEvent.type === "comment_added") {
      const c = commentEvent.data;
      if (c.task_id === task.id) {
        setComments((prev) =>
          prev.some((x) => x.id === c.id) ? prev : [...prev, c],
        );
        setTimeout(
          () => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          50,
        );
      }
    } else if (commentEvent.type === "comment_updated") {
      const c = commentEvent.data;
      if (c.task_id === task.id) {
        setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      }
    } else if (commentEvent.type === "comment_deleted") {
      const d = commentEvent.data;
      if (d.task_id === task.id) {
        setComments((prev) => prev.filter((x) => x.id !== d.id));
      }
    } else if (commentEvent.type === "activity_created") {
      const a = commentEvent.data;
      if (a.task_id === task.id) {
        setTaskActivity((prev) =>
          prev.some((x) => x.id === a.id) ? prev : [a, ...prev],
        );
      }
    }
  }, [commentEvent]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    if (!dueDate) return setError("Due date is required.");
    if (dueDate < new Date().toISOString().split("T")[0]) {
      return setError("Due date cannot be in the past.");
    }
    setSaving(true);
    try {
      const body = {
        title,
        description,
        status,
        priority,
        type: taskType,
        assignee_id: assignee || "",
        due_date: dueDate || "",
        sprint_id: sprintId || "",
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

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim() || !task) return;
    setSubmittingComment(true);
    try {
      const created = await request<Comment>(
        `/projects/${projectId}/tasks/${task.id}/comments`,
        { method: "POST", token, body: { body: commentBody.trim() } },
      );
      setComments((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      setCommentBody("");
      setTimeout(
        () => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function saveEditComment(commentId: string) {
    if (!editingCommentBody.trim() || !task) return;
    try {
      const updated = await request<Comment>(
        `/projects/${projectId}/tasks/${task.id}/comments/${commentId}`,
        { method: "PATCH", token, body: { body: editingCommentBody.trim() } },
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c)),
      );
      setEditingCommentId(null);
      setEditingCommentBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update comment");
    }
  }

  async function deleteComment(commentId: string) {
    if (!task) return;
    try {
      await request(
        `/projects/${projectId}/tasks/${task.id}/comments/${commentId}`,
        { method: "DELETE", token },
      );
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete comment");
    }
  }

  async function submitSubtask(e: FormEvent) {
    e.preventDefault();
    if (!subtaskTitle.trim() || !task) return;
    setSavingSubtask(true);
    try {
      const created = await request<Task>(`/projects/${projectId}/tasks`, {
        method: "POST",
        token,
        body: { title: subtaskTitle.trim(), type: "task", parent_id: task.id },
      });
      setSubtasks((prev) => [...prev, created]);
      setSubtaskTitle("");
      setShowSubtaskForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create subtask");
    } finally {
      setSavingSubtask(false);
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2>
            <TypeIcon
              type={task?.type ?? taskType}
              size={16}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {task ? "Task detail" : "New task"}
          </h2>
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">
          {error && <p className="error">{error}</p>}

          {/* ── Parent breadcrumb ─────────────────────────────────────── */}
          {task?.parent_id && parentTask && (
            <div
              style={{
                marginBottom: 10,
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              Parent:{" "}
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand)",
                  cursor: "pointer",
                  padding: 0,
                  fontWeight: 600,
                  fontSize: "inherit",
                }}
                onClick={() => onOpenTask?.(parentTask)}
              >
                <TypeIcon
                  type={parentTask.type}
                  size={12}
                  style={{ marginRight: 4, verticalAlign: "middle" }}
                />
                {parentTask.title}
              </button>
            </div>
          )}

          {/* ── Task form ─────────────────────────────────────────────── */}
          <form className="stack" onSubmit={submit} style={{ gap: 14 }}>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                style={{ minHeight: 72 }}
              />
            </Field>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Type">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as Task["type"])}
                >
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="story">Story</option>
                  <option value="epic">Epic</option>
                </select>
              </Field>
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
                  onChange={(e) =>
                    setPriority(e.target.value as Task["priority"])
                  }
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
              <Field label="Sprint">
                <select
                  value={sprintId}
                  onChange={(e) => setSprintId(e.target.value)}
                >
                  <option value="">Backlog (no sprint)</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.status === "active"
                        ? " ▶ Active"
                        : s.status === "completed"
                          ? " ✓"
                          : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date *">
                <input
                  type="date"
                  value={dueDate}
                  required
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    const val = e.target.value;
                    const today = new Date().toISOString().split("T")[0];
                    if (val && val < today) {
                      setDueDate("");
                      setError("Due date cannot be in the past.");
                    } else {
                      setDueDate(val);
                      setError((prev) =>
                        prev === "Due date cannot be in the past." ? "" : prev,
                      );
                    }
                  }}
                />
              </Field>
            </div>
            {canEdit && (
              <button className="button" disabled={saving}>
                {saving ? "Saving..." : task ? "Save task" : "Create task"}
              </button>
            )}
          </form>

          {/* ── Subtasks (only for non-subtask tasks) ─────────────────── */}
          {task && !task.parent_id && (
            <>
              <div className="drawer-divider" />
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <p className="drawer-section-title" style={{ margin: 0 }}>
                    Subtasks ({subtasks.length})
                  </p>
                  {!showSubtaskForm && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ fontSize: "0.8rem", padding: "3px 10px" }}
                      onClick={() => setShowSubtaskForm(true)}
                    >
                      + Add subtask
                    </button>
                  )}
                </div>

                {showSubtaskForm && (
                  <form
                    className="comment-form"
                    style={{ marginBottom: 10 }}
                    onSubmit={submitSubtask}
                  >
                    <input
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="Subtask title..."
                      autoFocus
                    />
                    <div className="row">
                      <button
                        className="button"
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        disabled={savingSubtask || !subtaskTitle.trim()}
                      >
                        {savingSubtask ? "Adding..." : "Add"}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        onClick={() => {
                          setShowSubtaskForm(false);
                          setSubtaskTitle("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loadingSubtasks ? (
                  <div
                    className="empty"
                    style={{ padding: "8px 0", fontSize: "0.85rem" }}
                  >
                    Loading subtasks...
                  </div>
                ) : subtasks.length === 0 ? (
                  <div
                    className="empty"
                    style={{ padding: "8px 0", fontSize: "0.85rem" }}
                  >
                    No subtasks yet.
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    {subtasks.map((st) => (
                      <div
                        key={st.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "var(--bg)",
                          cursor: "pointer",
                        }}
                        onClick={() => onOpenTask?.(st)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && onOpenTask?.(st)}
                      >
                        <TypeIcon type={st.type ?? "task"} size={13} />
                        <span
                          style={{
                            flex: 1,
                            fontSize: "0.88rem",
                            fontWeight: 500,
                          }}
                        >
                          {st.title}
                        </span>
                        <span
                          className="pill"
                          style={{ fontSize: "0.75rem", padding: "1px 6px" }}
                        >
                          {labelStatus(st.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Comments (only when editing an existing task) ────────── */}
          {task && (
            <>
              <div className="drawer-divider" />
              <div>
                <p className="drawer-section-title">
                  Comments ({comments.length})
                </p>

                {loadingComments ? (
                  <div
                    className="empty"
                    style={{ padding: "12px 0", fontSize: "0.85rem" }}
                  >
                    Loading comments...
                  </div>
                ) : (
                  <div className="comment-list">
                    {comments.length === 0 && (
                      <div
                        className="empty"
                        style={{ padding: "8px 0", fontSize: "0.85rem" }}
                      >
                        No comments yet. Be the first!
                      </div>
                    )}
                    {comments.map((c) => (
                      <div className="comment-item" key={c.id}>
                        <div className="comment-avatar">
                          {initials(c.author_name)}
                        </div>
                        <div className="comment-bubble">
                          <div className="comment-meta">
                            <span className="comment-author">
                              {c.author_name}
                            </span>
                            <span className="comment-time">
                              {timeAgo(c.created_at)}
                            </span>
                          </div>
                          {editingCommentId === c.id ? (
                            <div
                              className="comment-form"
                              style={{ marginTop: 4 }}
                            >
                              <textarea
                                value={editingCommentBody}
                                onChange={(e) =>
                                  setEditingCommentBody(e.target.value)
                                }
                                rows={2}
                              />
                              <div className="row">
                                <button
                                  type="button"
                                  className="button"
                                  style={{
                                    fontSize: "0.82rem",
                                    padding: "4px 12px",
                                  }}
                                  onClick={() => saveEditComment(c.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="button secondary"
                                  style={{
                                    fontSize: "0.82rem",
                                    padding: "4px 12px",
                                  }}
                                  onClick={() => setEditingCommentId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="comment-body">{c.body}</p>
                              {c.author_id === currentUser?.id && (
                                <div className="comment-actions">
                                  <button
                                    type="button"
                                    className="comment-action-btn"
                                    onClick={() => {
                                      setEditingCommentId(c.id);
                                      setEditingCommentBody(c.body);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="comment-action-btn danger"
                                    onClick={() => deleteComment(c.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={commentEndRef} />
                  </div>
                )}

                {/* Add comment form */}
                <form
                  className="comment-form"
                  style={{ marginTop: 12 }}
                  onSubmit={submitComment}
                >
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a comment..."
                    rows={2}
                  />
                  <button
                    className="button"
                    style={{ alignSelf: "flex-end", fontSize: "0.85rem" }}
                    disabled={submittingComment || !commentBody.trim()}
                  >
                    {submittingComment ? "Posting..." : "Post comment"}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* ── Task Activity ──────────────────────────────────────────── */}
          {task && (
            <>
              <div className="drawer-divider" />
              <div>
                <p className="drawer-section-title">Activity</p>
                <ActivityFeed events={taskActivity} loading={loadingActivity} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
