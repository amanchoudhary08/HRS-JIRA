import React, {
  FormEvent,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  request,
  fetchTaskLinks,
  createTaskLink,
  deleteTaskLink,
  searchUsers,
  fetchLabels,
  attachLabel,
  detachLabel,
} from "../api/client";
import { AttachmentZone } from "./AttachmentZone";
import { Field } from "./Field";
import { LabelPicker } from "./LabelPicker";
import { TypeIcon } from "./TypeIcon";
import { labelStatus } from "../utils/labelStatus";
import * as cx from "../styles/classes";
import type {
  Comment,
  Label,
  SSETaskEvent,
  Task,
  TaskLink,
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
  currentUser,
  commentEvent,
  onClose,
  onSaved,
  onOpenTask,
  sprints: _sprints,
  allLabels: _allLabels,
  canEdit: _canEdit,
}: {
  projectId: string;
  token: string | null;
  task: Task | null;
  users: User[];
  currentUser: User | null;
  commentEvent?: SSETaskEvent | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onOpenTask?: (task: Task) => void;
  sprints?: unknown[];
  allLabels?: unknown[];
  canEdit?: boolean;
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
  const [storyPoints, setStoryPoints] = useState<string>(
    task?.story_points != null ? String(task.story_points) : "",
  );
  const [error, setError] = useState("");

  // Labels state
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(
    task?.labels?.map((l) => l.id) ?? [],
  );

  // Auto-dismiss error after 3 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(t);
  }, [error]);
  const [saving, setSaving] = useState(false);

  // Subtask state
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDescription, setSubtaskDescription] = useState("");
  const [subtaskType, setSubtaskType] = useState<Task["type"]>("task");
  const [subtaskPriority, setSubtaskPriority] =
    useState<Task["priority"]>("medium");
  const [subtaskAssignee, setSubtaskAssignee] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
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

  // @mention typeahead state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<User[]>([]);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editCommentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Task links state
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkTargetSearch, setLinkTargetSearch] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState<Task[]>([]);
  const [linkType, setLinkType] = useState<TaskLink["link_type"]>("relates_to");
  const [savingLink, setSavingLink] = useState(false);

  // Sync all fields whenever the task prop changes
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setTaskType(task?.type ?? "task");
    setAssignee(task ? (task.assignee_id ?? "") : (currentUser?.id ?? ""));
    setDueDate(task?.due_date ?? "");
    setStoryPoints(task?.story_points != null ? String(task.story_points) : "");
    setError("");
    setSubtasks([]);
    setParentTask(null);
    setShowSubtaskForm(false);
    setSubtaskTitle("");
    setSubtaskDescription("");
    setSubtaskType("task");
    setSubtaskPriority("medium");
    setSubtaskAssignee("");
    setSubtaskDueDate("");
    setLinks([]);
    setShowLinkForm(false);
    setLinkTargetSearch("");
    setLinkSearchResults([]);
    // Reset label selections
    setSelectedLabelIds(task?.labels?.map((l) => l.id) ?? []);
  }, [task?.id]);

  // Load project labels whenever the modal is shown
  useEffect(() => {
    if (!token) return;
    fetchLabels(projectId, token)
      .then((data) => setAllLabels(data.labels))
      .catch(() => setAllLabels([]));
  }, [projectId, token]);

  // Load comments + subtasks + parent when a task is opened
  useEffect(() => {
    if (!task) {
      setComments([]);
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

    // Load task links
    setLoadingLinks(true);
    fetchTaskLinks(projectId, task.id, token ?? "")
      .then((data) => setLinks(data.links))
      .catch(() => setLinks([]))
      .finally(() => setLoadingLinks(false));
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
    }
  }, [commentEvent]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    if (!task && !dueDate) return setError("Due date is required.");
    if (dueDate && dueDate < new Date().toISOString().split("T")[0]) {
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
        story_points: storyPoints !== "" ? Number(storyPoints) : null,
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

      // Sync labels: attach newly selected, detach removed ones
      const prevIds = task?.labels?.map((l) => l.id) ?? [];
      const toAttach = selectedLabelIds.filter((id) => !prevIds.includes(id));
      const toDetach = prevIds.filter((id) => !selectedLabelIds.includes(id));
      await Promise.all([
        ...toAttach.map((id) =>
          attachLabel(projectId, saved.id, id, token ?? ""),
        ),
        ...toDetach.map((id) =>
          detachLabel(projectId, saved.id, id, token ?? ""),
        ),
      ]);

      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  // ── @mention helpers ────────────────────────────────────────────────────────

  const handleMentionInput = useCallback(
    async (value: string, cursorPos: number) => {
      const textBeforeCursor = value.substring(0, cursorPos);
      const match = textBeforeCursor.match(/@(\w+)$/);
      if (match) {
        const query = match[1];
        setMentionQuery(query);
        try {
          const data = await searchUsers(query, token ?? "");
          setMentionResults(data.users);
        } catch {
          setMentionResults([]);
        }
      } else {
        setMentionQuery(null);
        setMentionResults([]);
      }
    },
    [token],
  );

  function insertMention(
    user: User,
    currentValue: string,
    cursorPos: number,
  ): string {
    const textBeforeCursor = currentValue.substring(0, cursorPos);
    const textAfterCursor = currentValue.substring(cursorPos);
    const newBefore = textBeforeCursor.replace(/@(\w+)$/, `@${user.name}`);
    return newBefore + textAfterCursor;
  }

  function renderCommentBody(body: string): React.ReactNode {
    const parts = body.split(/(@\w+)/g);
    return parts.map((part, i) =>
      /^@\w+$/.test(part) ? (
        <span key={i} className={cx.mention}>
          {part}
        </span>
      ) : (
        part
      ),
    );
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

  async function searchLinkTarget(q: string) {
    setLinkTargetSearch(q);
    if (!q.trim()) {
      setLinkSearchResults([]);
      return;
    }
    try {
      const data = await request<{ tasks: Task[] }>(
        `/projects/${projectId}/tasks/search?q=${encodeURIComponent(q)}`,
        { token },
      );
      // Exclude the current task from results
      setLinkSearchResults(data.tasks.filter((t) => t.id !== task?.id));
    } catch {
      setLinkSearchResults([]);
    }
  }

  async function submitLink(targetTask: Task) {
    if (!task) return;
    setSavingLink(true);
    try {
      const created = await createTaskLink(
        projectId,
        task.id,
        { targetTaskId: targetTask.id, linkType },
        token ?? "",
      );
      setLinks((prev) => [...prev, created]);
      setShowLinkForm(false);
      setLinkTargetSearch("");
      setLinkSearchResults([]);
      setLinkType("relates_to");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link");
    } finally {
      setSavingLink(false);
    }
  }

  async function removeLink(linkId: string) {
    if (!task) return;
    try {
      await deleteTaskLink(projectId, task.id, linkId, token ?? "");
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove link");
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
        body: {
          title: subtaskTitle.trim(),
          description: subtaskDescription.trim() || undefined,
          type: subtaskType,
          priority: subtaskPriority,
          assignee_id: subtaskAssignee || undefined,
          due_date: subtaskDueDate || undefined,
          parent_id: task.id,
        },
      });
      setSubtasks((prev) => [...prev, created]);
      setSubtaskTitle("");
      setSubtaskDescription("");
      setSubtaskType("task");
      setSubtaskPriority("medium");
      setSubtaskAssignee("");
      setSubtaskDueDate("");
      setShowSubtaskForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create subtask");
    } finally {
      setSavingSubtask(false);
    }
  }

  return (
    <>
      <div className={cx.drawerBackdrop} onClick={onClose} />
      <div className={cx.drawer} style={{ position: "fixed" }}>
        <div className={cx.drawerHeader}>
          <h2>
            <TypeIcon
              type={task?.type ?? taskType}
              size={16}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {task ? "Task detail" : "New task"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className={cx.btnSecondary} type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className={cx.drawerBody}>
          {error && (
            <div
              className={cx.errorBox}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  padding: "0 2px",
                  flexShrink: 0,
                }}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

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
          <form className={cx.stack} onSubmit={submit} style={{ gap: 14 }}>
            <Field label="Title">
              <input
                className={cx.fieldInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
              />
            </Field>
            <Field label="Description">
              <textarea
                className={cx.fieldTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                style={{ minHeight: 72 }}
              />
            </Field>
            <div
              className={cx.stack}
              style={{ gridTemplateColumns: "1fr 1fr", display: "grid" }}
            >
              <Field label="Type">
                <select
                  className={cx.fieldSelect}
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
                  className={cx.fieldSelect}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Task["status"])}
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="in_review">In review</option>
                  <option value="done">Done</option>
                </select>
              </Field>
              <Field label="Priority">
                <select
                  className={cx.fieldSelect}
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
              <Field label="Story points">
                <input
                  className={cx.fieldInput}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="—"
                />
              </Field>
              <Field label="Assignee">
                <select
                  className={cx.fieldSelect}
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
                  className={cx.fieldInput}
                  type="date"
                  value={dueDate}
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
            <Field label="Labels">
              <LabelPicker
                allLabels={allLabels}
                selectedIds={selectedLabelIds}
                onAttach={(id) => setSelectedLabelIds((prev) => [...prev, id])}
                onDetach={(id) =>
                  setSelectedLabelIds((prev) => prev.filter((x) => x !== id))
                }
              />
            </Field>
            <button className={cx.btn} disabled={saving}>
              {saving ? "Saving..." : "Save task"}
            </button>
          </form>

          {/* ── Subtasks (only for non-subtask tasks) ─────────────────── */}
          {task && !task.parent_id && (
            <>
              <div className={cx.drawerDivider} />
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <p className={cx.drawerSectionTitle} style={{ margin: 0 }}>
                    Subtasks ({subtasks.length})
                  </p>
                  {!showSubtaskForm && (
                    <button
                      type="button"
                      className={cx.btnSecondary}
                      style={{ fontSize: "0.8rem", padding: "3px 10px" }}
                      onClick={() => setShowSubtaskForm(true)}
                    >
                      + Add subtask
                    </button>
                  )}
                </div>

                {showSubtaskForm && (
                  <form
                    style={{
                      marginBottom: 10,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                    onSubmit={submitSubtask}
                  >
                    <Field label="Title *">
                      <input
                        className={cx.fieldInput}
                        value={subtaskTitle}
                        onChange={(e) => setSubtaskTitle(e.target.value)}
                        placeholder="Subtask title..."
                        autoFocus
                      />
                    </Field>
                    <Field label="Description">
                      <textarea
                        className={cx.fieldInput}
                        value={subtaskDescription}
                        onChange={(e) => setSubtaskDescription(e.target.value)}
                        placeholder="Optional description..."
                        rows={2}
                        style={{ resize: "vertical" }}
                      />
                    </Field>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <Field label="Type">
                        <select
                          className={cx.fieldInput}
                          value={subtaskType}
                          onChange={(e) =>
                            setSubtaskType(e.target.value as Task["type"])
                          }
                        >
                          <option value="task">Task</option>
                          <option value="bug">Bug</option>
                          <option value="story">Story</option>
                          <option value="epic">Epic</option>
                        </select>
                      </Field>
                      <Field label="Priority">
                        <select
                          className={cx.fieldInput}
                          value={subtaskPriority}
                          onChange={(e) =>
                            setSubtaskPriority(
                              e.target.value as Task["priority"],
                            )
                          }
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </Field>
                      <Field label="Assignee">
                        <select
                          className={cx.fieldInput}
                          value={subtaskAssignee}
                          onChange={(e) => setSubtaskAssignee(e.target.value)}
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
                          className={cx.fieldInput}
                          value={subtaskDueDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setSubtaskDueDate(e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className={cx.row} style={{ marginTop: 4 }}>
                      <button
                        className={cx.btn}
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        disabled={
                          savingSubtask ||
                          !subtaskTitle.trim() ||
                          !subtaskDueDate
                        }
                      >
                        {savingSubtask ? "Adding..." : "Add subtask"}
                      </button>
                      <button
                        type="button"
                        className={cx.btnSecondary}
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        onClick={() => {
                          setShowSubtaskForm(false);
                          setSubtaskTitle("");
                          setSubtaskDescription("");
                          setSubtaskType("task");
                          setSubtaskPriority("medium");
                          setSubtaskAssignee("");
                          setSubtaskDueDate("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loadingSubtasks ? (
                  <div
                    className={cx.empty}
                    style={{ padding: "8px 0", fontSize: "0.85rem" }}
                  >
                    Loading subtasks...
                  </div>
                ) : subtasks.length === 0 ? (
                  <div
                    className={cx.empty}
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
                          className={cx.pill}
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

          {/* ── Linked Issues ─────────────────────────────────────── */}
          {task && (
            <>
              <div className={cx.drawerDivider} />
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <p className={cx.drawerSectionTitle} style={{ margin: 0 }}>
                    Linked Issues ({links.length})
                  </p>
                  {!showLinkForm && (
                    <button
                      type="button"
                      className={cx.btnSecondary}
                      style={{ fontSize: "0.8rem", padding: "3px 10px" }}
                      onClick={() => setShowLinkForm(true)}
                    >
                      + Link issue
                    </button>
                  )}
                </div>

                {showLinkForm && (
                  <div style={{ marginBottom: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        className={cx.fieldSelect}
                        style={{ flex: "0 0 160px", minHeight: 36 }}
                        value={linkType}
                        onChange={(e) =>
                          setLinkType(e.target.value as TaskLink["link_type"])
                        }
                      >
                        <option value="blocks">blocks</option>
                        <option value="is_blocked_by">is blocked by</option>
                        <option value="relates_to">relates to</option>
                        <option value="duplicates">duplicates</option>
                      </select>
                      <div style={{ flex: 1, position: "relative" }}>
                        <input
                          className={cx.fieldInput}
                          style={{ minHeight: 36 }}
                          value={linkTargetSearch}
                          onChange={(e) => searchLinkTarget(e.target.value)}
                          placeholder="Search task by title..."
                          autoFocus
                        />
                        {linkSearchResults.length > 0 && (
                          <div
                            className="popup-panel"
                            style={{
                              position: "absolute",
                              top: "calc(100% + 6px)",
                              left: 0,
                              right: 0,
                              zIndex: 200,
                              maxHeight: 220,
                              overflowY: "auto",
                              padding: "4px 0",
                            }}
                          >
                            {linkSearchResults.map((t, i) => (
                              <button
                                key={t.id}
                                type="button"
                                disabled={savingLink}
                                className={
                                  i > 0
                                    ? "popup-row popup-divider-t"
                                    : "popup-row"
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "8px 14px",
                                  border: "none",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  fontSize: "0.875rem",
                                  transition: "background 0.1s",
                                }}
                                onClick={() => submitLink(t)}
                              >
                                <TypeIcon type={t.type} size={14} />
                                <span
                                  style={{
                                    flex: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontWeight: 500,
                                  }}
                                >
                                  {t.title}
                                </span>
                                <span
                                  className="popup-muted"
                                  style={{ fontSize: "0.75rem", flexShrink: 0 }}
                                >
                                  {t.type}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={cx.row}>
                      <button
                        type="button"
                        className={cx.btnSecondary}
                        style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                        onClick={() => {
                          setShowLinkForm(false);
                          setLinkTargetSearch("");
                          setLinkSearchResults([]);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {loadingLinks ? (
                  <div
                    className={cx.empty}
                    style={{ padding: "8px 0", fontSize: "0.85rem" }}
                  >
                    Loading links...
                  </div>
                ) : links.length === 0 ? (
                  <div
                    className={cx.empty}
                    style={{ padding: "8px 0", fontSize: "0.85rem" }}
                  >
                    No linked issues yet.
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    {links.map((l) => {
                      const isSource = l.source_task_id === task.id;
                      const linkedTitle = isSource
                        ? l.target_task_title
                        : l.source_task_title;
                      const linkedId = isSource
                        ? l.target_task_id
                        : l.source_task_id;
                      const linkedTask = {
                        id: linkedId,
                        title: linkedTitle,
                      } as Task;
                      return (
                        <div
                          key={l.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 6,
                            background: "var(--bg)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 4,
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {l.link_type.replace(/_/g, " ")}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--brand)",
                              cursor: "pointer",
                              padding: 0,
                              fontWeight: 600,
                              fontSize: "0.88rem",
                              flex: 1,
                              textAlign: "left",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            onClick={() => onOpenTask?.(linkedTask)}
                          >
                            {linkedTitle}
                          </button>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              fontSize: "1rem",
                              lineHeight: 1,
                              padding: "0 2px",
                            }}
                            title="Remove link"
                            onClick={() => removeLink(l.id)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Attachments (only when editing an existing task) ─────── */}
          {task && (
            <>
              <div className={cx.drawerDivider} />
              <div>
                <p className={cx.drawerSectionTitle}>Attachments</p>
                <AttachmentZone
                  projectId={projectId}
                  taskId={task.id}
                  token={token}
                  currentUserId={currentUser?.id}
                  isOwner={!!_canEdit}
                />
              </div>
            </>
          )}

          {/* ── Comments (only when editing an existing task) ────────── */}
          {task && (
            <>
              <div className={cx.drawerDivider} />
              <div>
                <p className={cx.drawerSectionTitle}>
                  Comments ({comments.length})
                </p>

                {loadingComments ? (
                  <div
                    className={cx.empty}
                    style={{ padding: "12px 0", fontSize: "0.85rem" }}
                  >
                    Loading comments...
                  </div>
                ) : (
                  <div className={cx.commentList}>
                    {comments.length === 0 && (
                      <div
                        className={cx.empty}
                        style={{ padding: "8px 0", fontSize: "0.85rem" }}
                      >
                        No comments yet. Be the first!
                      </div>
                    )}
                    {comments.map((c) => (
                      <div className={cx.commentItem} key={c.id}>
                        <div className={cx.commentAvatar}>
                          {initials(c.author_name)}
                        </div>
                        <div className={cx.commentBubble}>
                          <div className={cx.commentMeta}>
                            <span className={cx.commentAuthor}>
                              {c.author_name}
                            </span>
                            <span className={cx.commentTime}>
                              {timeAgo(c.created_at)}
                            </span>
                          </div>
                          {editingCommentId === c.id ? (
                            <div
                              className={cx.commentForm}
                              style={{ marginTop: 4 }}
                            >
                              <textarea
                                className={cx.fieldTextarea}
                                value={editingCommentBody}
                                onChange={(e) =>
                                  setEditingCommentBody(e.target.value)
                                }
                                rows={2}
                              />
                              <div className={cx.row}>
                                <button
                                  type="button"
                                  className={cx.btn}
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
                                  className={cx.btnSecondary}
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
                              <p className={cx.commentBody}>
                                {renderCommentBody(c.body)}
                              </p>
                              {c.author_id === currentUser?.id && (
                                <div className={cx.commentActions}>
                                  <button
                                    type="button"
                                    className={cx.commentActionBtn}
                                    onClick={() => {
                                      setEditingCommentId(c.id);
                                      setEditingCommentBody(c.body);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={cx.commentActionBtnDanger}
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
                  className={cx.commentForm}
                  style={{ marginTop: 12 }}
                  onSubmit={submitComment}
                >
                  <div style={{ position: "relative" }}>
                    <textarea
                      ref={commentTextareaRef}
                      className={cx.fieldTextarea}
                      value={commentBody}
                      onChange={(e) => {
                        setCommentBody(e.target.value);
                        handleMentionInput(
                          e.target.value,
                          e.target.selectionStart ?? e.target.value.length,
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setMentionQuery(null);
                          setMentionResults([]);
                        }
                      }}
                      placeholder="Write a comment... use @name to mention"
                      rows={2}
                    />
                    {mentionQuery !== null && mentionResults.length > 0 && (
                      <div
                        className="popup-panel"
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          zIndex: 200,
                          maxHeight: 200,
                          overflowY: "auto",
                          padding: "4px 0",
                        }}
                      >
                        {mentionResults.map((u, i) => (
                          <button
                            key={u.id}
                            type="button"
                            className={
                              i > 0 ? "popup-row popup-divider-t" : "popup-row"
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "8px 14px",
                              border: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: "0.875rem",
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const textarea = commentTextareaRef.current;
                              const cursor =
                                textarea?.selectionStart ?? commentBody.length;
                              const newBody = insertMention(
                                u,
                                commentBody,
                                cursor,
                              );
                              setCommentBody(newBody);
                              setMentionQuery(null);
                              setMentionResults([]);
                              setTimeout(() => textarea?.focus(), 0);
                            }}
                          >
                            <span
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "var(--color-brand)",
                                color: "#fff",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {u.name
                                .split(" ")
                                .map((w: string) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <span style={{ fontWeight: 500 }}>{u.name}</span>
                            <span
                              className="popup-muted"
                              style={{
                                fontSize: "0.78rem",
                                marginLeft: "auto",
                              }}
                            >
                              {u.email}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className={cx.btn}
                    style={{ alignSelf: "flex-end", fontSize: "0.85rem" }}
                    disabled={submittingComment || !commentBody.trim()}
                  >
                    {submittingComment ? "Posting..." : "Post comment"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
