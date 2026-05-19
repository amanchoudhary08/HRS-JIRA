import React, { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { request } from "../api/client";
import {
  fetchLabels,
  createLabel,
  updateLabel,
  deleteLabel,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useProjectEvents } from "../hooks/useProjectEvents";
import { Layout } from "../components/Layout";
import { ProjectSidebar } from "../components/ProjectSidebar";
import { Field } from "../components/Field";
import { TaskModal } from "../components/TaskModal";
import { MemberList } from "../components/MemberList";
import { InviteMemberModal } from "../components/InviteMemberModal";
import { TypeIcon } from "../components/TypeIcon";
import { ActivityFeed } from "../components/ActivityFeed";
import { LabelChip } from "../components/LabelChip";
import { labelStatus } from "../utils/labelStatus";
import { ArrowLeftIcon } from "../components/icons";
import * as cx from "../styles/classes";
import type {
  ActivityEvent,
  Label,
  Project,
  ProjectMember,
  Sprint,
  SSETaskEvent,
  Task,
  User,
} from "../types";

type ActiveTab = "tasks" | "members" | "activity" | "labels";

export function ProjectDetailPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<(Project & { tasks: Task[] }) | null>(
    null,
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const assignee = searchParams.get("assignee") ?? "";

  function setStatus(val: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val) next.set("status", val);
        else next.delete("status");
        return next;
      },
      { replace: true },
    );
  }

  function setAssignee(val: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val) next.set("assignee", val);
        else next.delete("assignee");
        return next;
      },
      { replace: true },
    );
  }

  const [editing, setEditing] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [taskPage, setTaskPage] = useState(1);
  const [taskTotal, setTaskTotal] = useState(0);
  const TASK_LIMIT = 20;
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    (searchParams.get("tab") as ActiveTab) ?? "tasks",
  );
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [latestCommentEvent, setLatestCommentEvent] =
    useState<SSETaskEvent | null>(null);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  // Label filter
  const [labelFilter, setLabelFilter] = useState("");
  // New label form
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [savingLabel, setSavingLabel] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("");

  const sseConnected = useProjectEvents(
    id,
    token,
    (event: SSETaskEvent) => {
      if (event.type === "task_created") {
        setTasks((prev) =>
          prev.some((t) => t.id === event.data.id)
            ? prev
            : [event.data, ...prev],
        );
      } else if (event.type === "task_updated") {
        setTasks((prev) =>
          prev.map((t) => (t.id === event.data.id ? event.data : t)),
        );
      } else if (event.type === "task_deleted") {
        setTasks((prev) => prev.filter((t) => t.id !== event.data.id));
      } else if (
        event.type === "comment_added" ||
        event.type === "comment_updated" ||
        event.type === "comment_deleted"
      ) {
        setLatestCommentEvent(event);
      }
    },
    (activityEvent: ActivityEvent) => {
      setActivityEvents((prev) => [activityEvent, ...prev]);
      // Also forward as commentEvent so TaskModal can live-update its activity list
      setLatestCommentEvent({ type: "activity_created", data: activityEvent });
    },
  );

  async function load() {
    setLoading(true);
    try {
      const [detail, userData] = await Promise.all([
        request<Project & { tasks: Task[]; members: ProjectMember[] }>(
          `/projects/${id}`,
          { token },
        ),
        request<{ users: User[] }>("/users", { token }),
      ]);
      setProject(detail);
      setTasks(detail.tasks);
      setTaskTotal(detail.tasks.length);
      setUsers(userData.users);
      setMembers(detail.members ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project");
    } finally {
      setLoading(false);
    }
    // Load activity separately (non-blocking)
    setActivityLoading(true);
    request<{ activity: ActivityEvent[] }>(
      `/projects/${id}/activity?limit=50`,
      { token },
    )
      .then((data) => setActivityEvents(data.activity))
      .catch(() => {
        /* activity is non-critical */
      })
      .finally(() => setActivityLoading(false));
    // Load sprints (non-blocking)
    request<{ sprints: Sprint[] }>(`/projects/${id}/sprints`, { token })
      .then((data) => setSprints(data.sprints))
      .catch(() => {
        /* sprints non-critical */
      });
    // Load labels (non-blocking)
    if (id && token) {
      fetchLabels(id, token)
        .then((data) => setLabels(data.labels))
        .catch(() => {});
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setTaskPage(1);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (assignee) qs.set("assignee", assignee);
    qs.set("page", "1");
    qs.set("limit", String(TASK_LIMIT));
    request<{ tasks: Task[]; total: number }>(`/projects/${id}/tasks?${qs}`, {
      token,
    })
      .then((data) => {
        setTasks(data.tasks);
        setTaskTotal(data.total);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not filter tasks"),
      );
  }, [status, assignee]);

  useEffect(() => {
    if (!status && !assignee && taskPage === 1) return;
    if (!id) return;
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (assignee) qs.set("assignee", assignee);
    qs.set("page", String(taskPage));
    qs.set("limit", String(TASK_LIMIT));
    request<{ tasks: Task[]; total: number }>(`/projects/${id}/tasks?${qs}`, {
      token,
    })
      .then((data) => {
        setTasks(data.tasks);
        setTaskTotal(data.total);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load tasks"),
      );
  }, [taskPage]);

  async function optimisticStatus(task: Task, nextStatus: Task["status"]) {
    const previous = tasks;
    setTasks(
      tasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
    );
    try {
      const updated = await request<Task>(`/projects/${id}/tasks/${task.id}`, {
        method: "PATCH",
        token,
        body: { status: nextStatus },
      });
      setTasks((current) =>
        current.map((t) => (t.id === task.id ? updated : t)),
      );
    } catch (err) {
      setTasks(previous);
      setError(
        err instanceof Error ? err.message : "Task update failed; reverted.",
      );
    }
  }

  function upsertTask(task: Task) {
    setTasks((current) =>
      current.some((t) => t.id === task.id)
        ? current.map((t) => (t.id === task.id ? task : t))
        : [task, ...current],
    );
    setShowCreate(false);
    setEditing(null);
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task?")) return;
    const previous = tasks;
    setTasks(tasks.filter((t) => t.id !== taskId));
    try {
      await request(`/projects/${id}/tasks/${taskId}`, {
        method: "DELETE",
        token,
      });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Could not delete task");
    }
  }

  async function deleteProject() {
    if (!window.confirm("Delete this project and all its tasks?")) return;
    try {
      await request(`/projects/${id}`, { method: "DELETE", token });
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete project");
    }
  }

  async function changeRole(userId: string, role: ProjectMember["role"]) {
    try {
      const updated = await request<ProjectMember>(
        `/projects/${id}/members/${userId}`,
        { method: "PATCH", token, body: { role } },
      );
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? updated : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change role");
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remove this member from the project?")) return;
    try {
      await request(`/projects/${id}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    }
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      const updated = await request<Project>(`/projects/${id}`, {
        method: "PATCH",
        token,
        body: { name: projectName, description: projectDescription },
      });
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditingProject(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update project");
    }
  }

  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? "viewer";
  const canEdit = myRole !== "viewer";

  // Filter tasks by label (client-side on current page)
  const visibleTasks = labelFilter
    ? tasks.filter((t) => t.labels?.some((l) => l.id === labelFilter))
    : tasks;

  function taskInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const grouped = {
    todo: visibleTasks.filter((t) => t.status === "todo"),
    in_progress: visibleTasks.filter((t) => t.status === "in_progress"),
    blocked: visibleTasks.filter((t) => t.status === "blocked"),
    in_review: visibleTasks.filter((t) => t.status === "in_review"),
    done: visibleTasks.filter((t) => t.status === "done"),
  };

  const [dragOverCol, setDragOverCol] = useState<Task["status"] | null>(null);

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, col: Task["status"]) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function handleDrop(e: React.DragEvent, col: Task["status"]) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== col) {
      void optimisticStatus(task, col);
    }
  }

  const sidebarEl = (
    <ProjectSidebar
      projectId={id!}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as ActiveTab)}
      memberCount={members.length}
      labelCount={labels.length}
    />
  );

  return (
    <Layout sidebar={sidebarEl} backTo="/projects">
      {loading ? (
        <div className={cx.empty}>Loading project...</div>
      ) : project ? (
        <>
          {editingProject ? (
            <form
              className={`${cx.card} ${cx.stack}`}
              style={{ marginBottom: 20 }}
              onSubmit={saveProject}
            >
              <Field label="Project name">
                <input
                  className={cx.fieldInput}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Field>
              <Field label="Description">
                <input
                  className={cx.fieldInput}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </Field>
              <div className={cx.row}>
                <button className={cx.btn} type="submit">
                  Save
                </button>
                <button
                  className={cx.btnSecondary}
                  type="button"
                  onClick={() => setEditingProject(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className={cx.toolbar}>
              <div>
                <h1 className={cx.pageTitle}>{project.name}</h1>
                <p className={cx.pageSubtitle}>
                  {project.description || "No description yet."}
                </p>
              </div>
              <div className={cx.row}>
                <span
                  className={
                    sseConnected
                      ? `${cx.liveBadge} ${cx.liveBadgeOn}`
                      : cx.liveBadge
                  }
                  title={
                    sseConnected
                      ? "Receiving real-time updates"
                      : "Connecting to live updates..."
                  }
                >
                  {sseConnected ? "● Live" : "○ Connecting"}
                </span>
                {project.owner_id === user?.id && (
                  <>
                    <button
                      className={cx.btnSecondary}
                      onClick={() => {
                        setProjectName(project.name);
                        setProjectDescription(project.description);
                        setEditingProject(true);
                      }}
                    >
                      Edit project
                    </button>
                    <button className={cx.btnDanger} onClick={deleteProject}>
                      Delete project
                    </button>
                  </>
                )}
                {canEdit && (
                  <button
                    className={cx.btn}
                    onClick={() => setShowCreate(true)}
                  >
                    New task
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <p className={cx.errorBox}>{error}</p>}
          {activeTab === "tasks" && (
            <>
              <div className={`${cx.card} ${cx.filters}`}>
                <Field label="Status filter">
                  <select
                    className={cx.fieldSelect}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                  </select>
                </Field>
                <Field label="Assignee filter">
                  <select
                    className={cx.fieldSelect}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">All assignees</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {labels.length > 0 && (
                  <Field label="Label filter">
                    <select
                      className={cx.fieldSelect}
                      value={labelFilter}
                      onChange={(e) => setLabelFilter(e.target.value)}
                    >
                      <option value="">All labels</option>
                      {labels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <div style={{ height: 20 }} />
              <div
                className="grid grid-cols-[repeat(5,minmax(0,1fr))]"
                style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
              >
                {(
                  [
                    "todo",
                    "in_progress",
                    "blocked",
                    "in_review",
                    "done",
                  ] as const
                ).map((key) => (
                  <section
                    className={
                      dragOverCol === key
                        ? cx.boardColumnDragOver
                        : cx.boardColumn
                    }
                    key={key}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={(e) => handleDrop(e, key)}
                  >
                    <h3>
                      {labelStatus(key)}{" "}
                      <span className={cx.pill}>{grouped[key].length}</span>
                    </h3>
                    {grouped[key].length === 0 ? (
                      <div className={cx.empty + " py-4 text-sm"}>
                        No tasks here.
                      </div>
                    ) : (
                      grouped[key].map((task) => (
                        <article
                          className={cx.taskCard}
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onClick={() => setEditing(task)}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
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
                              <h3 style={{ margin: 0, fontSize: 14 }}>
                                {task.title}
                              </h3>
                            </div>
                            <p
                              className="text-text-muted"
                              style={{ margin: "4px 0 0", fontSize: 13 }}
                            >
                              {task.description || "No description."}
                            </p>
                          </div>
                          <div className={cx.row} style={{ marginTop: 8 }}>
                            <span className={cx.priorityClass(task.priority)}>
                              {task.priority}
                            </span>
                            {task.story_points != null && (
                              <span
                                className="text-text-muted"
                                style={{ fontSize: "0.75rem" }}
                              >
                                {task.story_points} pts
                              </span>
                            )}
                            <span className={cx.pill}>
                              {(() => {
                                const u = users.find(
                                  (u) => u.id === task.assignee_id,
                                );
                                return u ? taskInitials(u.name) : "?";
                              })()}
                            </span>
                          </div>
                          {task.labels && task.labels.length > 0 && (
                            <div
                              className={cx.row}
                              style={{
                                marginTop: 4,
                                flexWrap: "wrap",
                                gap: 4,
                              }}
                            >
                              {task.labels.map((l) => (
                                <LabelChip key={l.id} label={l} />
                              ))}
                            </div>
                          )}
                          {canEdit && (
                            <div className={cx.row} style={{ marginTop: 6 }}>
                              <button
                                className={cx.btnSecondary}
                                style={{ fontSize: 11, padding: "2px 8px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(task);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className={cx.btnDanger}
                                style={{ fontSize: 11, padding: "2px 8px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteTask(task.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </article>
                      ))
                    )}
                  </section>
                ))}
              </div>
              {(showCreate || editing) && (
                <TaskModal
                  projectId={id!}
                  token={token}
                  task={editing}
                  users={users}
                  sprints={sprints}
                  allLabels={labels}
                  currentUser={user}
                  commentEvent={latestCommentEvent}
                  canEdit={canEdit}
                  onClose={() => {
                    setShowCreate(false);
                    setEditing(null);
                  }}
                  onSaved={upsertTask}
                  onOpenTask={(t) => setEditing(t)}
                />
              )}
              {Math.ceil(taskTotal / TASK_LIMIT) > 1 && (
                <div className={cx.pagination} style={{ marginTop: 24 }}>
                  <button
                    className={cx.btnSecondary}
                    disabled={taskPage === 1}
                    onClick={() => setTaskPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span className={cx.paginationInfo}>
                    Page {taskPage} of {Math.ceil(taskTotal / TASK_LIMIT)}
                  </span>
                  <button
                    className={cx.btnSecondary}
                    disabled={taskPage >= Math.ceil(taskTotal / TASK_LIMIT)}
                    onClick={() => setTaskPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── Labels tab ─── */}
          {activeTab === "labels" && (
            <div style={{ marginTop: 20 }}>
              <div
                className={`${cx.card} ${cx.stack}`}
                style={{ marginBottom: 20 }}
              >
                <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem" }}>
                  Create label
                </h3>
                <form
                  className={cx.row}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newLabelName.trim() || !id || !token) return;
                    setSavingLabel(true);
                    try {
                      const created = await createLabel(
                        id,
                        { name: newLabelName.trim(), color: newLabelColor },
                        token,
                      );
                      setLabels((prev) => [...prev, created]);
                      setNewLabelName("");
                      setNewLabelColor("#6366f1");
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Could not create label",
                      );
                    } finally {
                      setSavingLabel(false);
                    }
                  }}
                >
                  <input
                    className={cx.fieldInput}
                    placeholder="Label name"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    style={{ width: 40, padding: 2, cursor: "pointer" }}
                    title="Pick a colour"
                  />
                  <button className={cx.btn} disabled={savingLabel}>
                    {savingLabel ? "Saving..." : "+ Create"}
                  </button>
                </form>
              </div>

              {labels.length === 0 ? (
                <div className={cx.empty}>No labels yet. Create one above.</div>
              ) : (
                <div className={cx.stack} style={{ gap: 8 }}>
                  {labels.map((label) =>
                    editingLabel?.id === label.id ? (
                      <div
                        key={label.id}
                        className={`${cx.card} ${cx.row}`}
                        style={{ alignItems: "center", gap: 10 }}
                      >
                        <input
                          className={cx.fieldInput}
                          value={editLabelName}
                          onChange={(e) => setEditLabelName(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="color"
                          value={editLabelColor}
                          onChange={(e) => setEditLabelColor(e.target.value)}
                          style={{
                            width: 40,
                            padding: 2,
                            cursor: "pointer",
                          }}
                        />
                        <button
                          className={cx.btn}
                          onClick={async () => {
                            if (!id || !token) return;
                            try {
                              const updated = await updateLabel(
                                id,
                                label.id,
                                {
                                  name: editLabelName,
                                  color: editLabelColor,
                                },
                                token,
                              );
                              setLabels((prev) =>
                                prev.map((l) =>
                                  l.id === updated.id ? updated : l,
                                ),
                              );
                              setEditingLabel(null);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Could not update label",
                              );
                            }
                          }}
                        >
                          Save
                        </button>
                        <button
                          className={cx.btnSecondary}
                          onClick={() => setEditingLabel(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div
                        key={label.id}
                        className={`${cx.card} ${cx.row}`}
                        style={{ alignItems: "center", gap: 10 }}
                      >
                        <LabelChip label={label} />
                        <span
                          className="text-text-muted"
                          style={{ fontSize: "0.8rem", marginLeft: 4 }}
                        >
                          {label.color}
                        </span>
                        <div style={{ marginLeft: "auto" }} className={cx.row}>
                          <button
                            className={cx.btnSecondary}
                            onClick={() => {
                              setEditingLabel(label);
                              setEditLabelName(label.name);
                              setEditLabelColor(label.color);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className={cx.btnDanger}
                            onClick={async () => {
                              if (
                                !window.confirm(`Delete label "${label.name}"?`)
                              )
                                return;
                              if (!id || !token) return;
                              try {
                                await deleteLabel(id, label.id, token);
                                setLabels((prev) =>
                                  prev.filter((l) => l.id !== label.id),
                                );
                                if (labelFilter === label.id)
                                  setLabelFilter("");
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not delete label",
                                );
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Members tab ─── */}
          {activeTab === "members" && (
            <div style={{ marginTop: 20 }}>
              {(project?.owner_id === user?.id ||
                members.some(
                  (m) =>
                    m.user_id === user?.id &&
                    (m.role === "owner" || m.role === "admin"),
                )) && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    className={cx.btn}
                    onClick={() => setShowInvite(true)}
                  >
                    + Invite member
                  </button>
                </div>
              )}
              <MemberList
                members={members}
                currentUserId={user?.id ?? ""}
                isOwner={project?.owner_id === user?.id}
                onChangeRole={changeRole}
                onRemove={removeMember}
              />
            </div>
          )}

          {/* ─── Activity tab ─── */}
          {activeTab === "activity" && (
            <div style={{ marginTop: 20 }}>
              <div className={cx.card} style={{ padding: "16px 20px" }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: "1rem" }}>
                  Project Activity
                </h3>
                <ActivityFeed
                  events={activityEvents}
                  loading={activityLoading}
                />
              </div>
            </div>
          )}

          {showInvite && (
            <InviteMemberModal
              projectId={id!}
              token={token}
              onClose={() => setShowInvite(false)}
              onInvited={(m) => setMembers((prev) => [...prev, m])}
            />
          )}
        </>
      ) : (
        <div className={cx.empty}>Project not found.</div>
      )}
    </Layout>
  );
}
