import React, { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useProjectEvents } from "../hooks/useProjectEvents";
import { Layout } from "../components/Layout";
import { Field } from "../components/Field";
import { TaskModal } from "../components/TaskModal";
import { MemberList } from "../components/MemberList";
import { InviteMemberModal } from "../components/InviteMemberModal";
import { labelStatus } from "../utils/labelStatus";
import { ArrowLeftIcon } from "../components/icons";
import type {
  Project,
  ProjectMember,
  SSETaskEvent,
  Task,
  User,
} from "../types";

type ActiveTab = "tasks" | "members";

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
  const [activeTab, setActiveTab] = useState<ActiveTab>("tasks");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  const sseConnected = useProjectEvents(id, token, (event: SSETaskEvent) => {
    if (event.type === "task_created") {
      setTasks((prev) =>
        prev.some((t) => t.id === event.data.id) ? prev : [event.data, ...prev],
      );
    } else if (event.type === "task_updated") {
      setTasks((prev) =>
        prev.map((t) => (t.id === event.data.id ? event.data : t)),
      );
    } else if (event.type === "task_deleted") {
      setTasks((prev) => prev.filter((t) => t.id !== event.data.id));
    }
  });

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

  const grouped = {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
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

  return (
    <Layout>
      <Link
        to="/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
          color: "var(--text-muted)",
          textDecoration: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "var(--text-muted)")
        }
      >
        <ArrowLeftIcon />
        Back to projects
      </Link>
      {loading ? (
        <div className="empty">Loading project...</div>
      ) : project ? (
        <>
          {editingProject ? (
            <form
              className="card stack"
              style={{ marginBottom: 20 }}
              onSubmit={saveProject}
            >
              <Field label="Project name">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Field>
              <Field label="Description">
                <input
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </Field>
              <div className="row">
                <button className="button" type="submit">
                  Save
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditingProject(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="toolbar">
              <div>
                <h1 className="title">{project.name}</h1>
                <p className="subtitle">
                  {project.description || "No description yet."}
                </p>
              </div>
              <div className="row">
                <span
                  className={`live-badge${sseConnected ? " live-badge--on" : ""}`}
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
                      className="button secondary"
                      onClick={() => {
                        setProjectName(project.name);
                        setProjectDescription(project.description);
                        setEditingProject(true);
                      }}
                    >
                      Edit project
                    </button>
                    <button className="button danger" onClick={deleteProject}>
                      Delete project
                    </button>
                  </>
                )}
                <button className="button" onClick={() => setShowCreate(true)}>
                  New task
                </button>
              </div>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {/* Tab switcher */}
          <div className="tab-bar">
            <button
              className={`tab-btn${activeTab === "tasks" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("tasks")}
            >
              Tasks
            </button>
            <button
              className={`tab-btn${activeTab === "members" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Members
              <span
                className="pill"
                style={{ marginLeft: 6, fontSize: "0.75rem" }}
              >
                {members.length}
              </span>
            </button>
          </div>

          {/* ─── Tasks tab ─── */}
          {activeTab === "tasks" && (
            <>
              <div className="card filters">
                <Field label="Status filter">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </Field>
                <Field label="Assignee filter">
                  <select
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
              </div>
              <div style={{ height: 20 }} />
              <div className="grid">
                {(["todo", "in_progress", "done"] as const).map((key) => (
                  <section
                    className={`column${dragOverCol === key ? " column--drag-over" : ""}`}
                    key={key}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={(e) => handleDrop(e, key)}
                  >
                    <h3>
                      {labelStatus(key)}{" "}
                      <span className="pill">{grouped[key].length}</span>
                    </h3>
                    {grouped[key].length === 0 ? (
                      <div className="empty column-empty">No tasks here.</div>
                    ) : (
                      grouped[key].map((task) => (
                        <article
                          className="card task-card"
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                        >
                          <div>
                            <h3>{task.title}</h3>
                            <p className="muted">
                              {task.description || "No description."}
                            </p>
                          </div>
                          <div className="row">
                            <span className={`pill priority-${task.priority}`}>
                              {task.priority}
                            </span>
                            <span className="pill">
                              {users.find((u) => u.id === task.assignee_id)
                                ?.name || "Unassigned"}
                            </span>
                          </div>
                          {task.due_date && (
                            <span className="muted">Due {task.due_date}</span>
                          )}
                          <div className="row">
                            <select
                              value={task.status}
                              onChange={(e) =>
                                optimisticStatus(
                                  task,
                                  e.target.value as Task["status"],
                                )
                              }
                            >
                              <option value="todo">Todo</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                            <button
                              className="button secondary"
                              onClick={() => setEditing(task)}
                            >
                              Edit
                            </button>
                            <button
                              className="button danger"
                              onClick={() => deleteTask(task.id)}
                            >
                              Delete
                            </button>
                          </div>
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
                  currentUser={user}
                  onClose={() => {
                    setShowCreate(false);
                    setEditing(null);
                  }}
                  onSaved={upsertTask}
                />
              )}
              {Math.ceil(taskTotal / TASK_LIMIT) > 1 && (
                <div className="pagination" style={{ marginTop: 24 }}>
                  <button
                    className="button secondary"
                    disabled={taskPage === 1}
                    onClick={() => setTaskPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="pagination-info">
                    Page {taskPage} of {Math.ceil(taskTotal / TASK_LIMIT)}
                  </span>
                  <button
                    className="button secondary"
                    disabled={taskPage >= Math.ceil(taskTotal / TASK_LIMIT)}
                    onClick={() => setTaskPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
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
                    className="button"
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
        <div className="empty">Project not found.</div>
      )}
    </Layout>
  );
}
