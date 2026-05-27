import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Sparkles, X, Loader2 } from "lucide-react";
import { AI_URL } from "../api/aiClient";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useProjectEvents } from "../hooks/useProjectEvents";
import { Layout } from "../components/Layout";
import { ProjectSidebar } from "../components/ProjectSidebar";
import { TaskCard } from "../components/TaskCard";
import { TaskModal } from "../components/TaskModal";
import { TypeIcon } from "../components/TypeIcon";
import { ArrowLeftIcon } from "../components/icons";
import * as cx from "../styles/classes";
import type { Project, Sprint, SSETaskEvent, Task, User } from "../types";

// ─── Sortable task wrapper ────────────────────────────────────────────────────

function SortableTaskCard({
  task,
  users,
  onOpen,
  onStatusChange,
}: {
  task: Task;
  users: User[];
  onOpen: (t: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      users={users}
      dragging={isDragging}
      onClick={() => onOpen(task)}
      onStatusChange={onStatusChange}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    />
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

const COLUMNS: { id: Task["status"]; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "in_review", label: "In Review" },
  { id: "done", label: "Done" },
];

function KanbanColumn({
  col,
  tasks,
  users,
  onOpen,
  onStatusChange,
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  users: User[];
  onOpen: (t: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
}) {
  const { setNodeRef, isOver } = useSortable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className={cx.boardColumn}
      style={{
        flex: 1,
        minWidth: 240,
        border: isOver ? "2px dashed var(--brand)" : "2px solid transparent",
        borderRadius: 8,
        padding: "0 4px 8px",
        transition: "border-color 0.15s",
      }}
    >
      <div
        style={{
          padding: "10px 6px 8px",
          fontWeight: 700,
          fontSize: 13,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {col.label}
        <span
          style={{
            background: "var(--pill-bg)",
            borderRadius: 999,
            padding: "0 7px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {tasks.map((t) => (
          <SortableTaskCard
            key={t.id}
            task={t}
            users={users}
            onOpen={onOpen}
            onStatusChange={onStatusChange}
          />
        ))}
      </SortableContext>
      {tasks.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
            padding: "24px 0",
          }}
        >
          Drop tasks here
        </div>
      )}
    </div>
  );
}

// ─── Sprint modal ─────────────────────────────────────────────────────────────

function CreateSprintModal({
  projectId,
  token,
  onCreated,
  onClose,
}: {
  projectId: string;
  token: string;
  onCreated: (s: Sprint) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Sprint name is required");
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    if (!endDate) {
      setError("End date is required.");
      return;
    }
    if (startDate < today) {
      setError("Start date cannot be in the past.");
      return;
    }
    if (endDate < today) {
      setError("End date cannot be in the past.");
      return;
    }
    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await request<Sprint>(`/projects/${projectId}/sprints`, {
        method: "POST",
        token,
        body: {
          name,
          goal: goal || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      onCreated(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cx.modalBackdrop} onClick={onClose}>
      <div
        className={cx.modal}
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px" }}>Create Sprint</h3>
        {error && <div className={cx.errorBox}>{error}</div>}
        <form className={cx.stack} onSubmit={submit}>
          <label className={cx.field}>
            <span className={cx.fieldLabel}>Sprint Name *</span>
            <input
              className={cx.fieldInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sprint 1"
            />
          </label>
          <label className={cx.field}>
            <span className={cx.fieldLabel}>Goal</span>
            <input
              className={cx.fieldInput}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What is the sprint goal?"
            />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <label className={cx.field} style={{ flex: 1 }}>
              <span className={cx.fieldLabel}>Start date *</span>
              <input
                className={cx.fieldInput}
                type="date"
                value={startDate}
                required
                min={today}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && val < today) {
                    setStartDate("");
                    setError("Start date cannot be in the past.");
                    return;
                  }
                  setStartDate(val);
                  if (endDate && endDate < val) {
                    setEndDate("");
                  }
                  setError("");
                }}
              />
            </label>
            <label className={cx.field} style={{ flex: 1 }}>
              <span className={cx.fieldLabel}>End date *</span>
              <input
                className={cx.fieldInput}
                type="date"
                value={endDate}
                required
                min={startDate || today}
                onChange={(e) => {
                  const val = e.target.value;
                  const minDate = startDate || today;
                  if (val && val < minDate) {
                    setEndDate("");
                    setError(
                      startDate
                        ? "End date cannot be before start date."
                        : "End date cannot be in the past.",
                    );
                    return;
                  }
                  setEndDate(val);
                  setError("");
                }}
              />
            </label>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button type="button" className={cx.btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={cx.btn} disabled={loading}>
              {loading ? "Creating…" : "Create Sprint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Board Page ──────────────────────────────────────────────────────────

export function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { token, user: me } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | "backlog">(
    "backlog",
  );
  const [columns, setColumns] = useState<Record<Task["status"], Task[]>>({
    todo: [],
    in_progress: [],
    blocked: [],
    in_review: [],
    done: [],
  });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ── AI Sprint Analysis ──────────────────────────────────────────────────────
  const [aiAnalysing, setAiAnalysing] = useState(false);
  const [aiOutput, setAiOutput] = useState("");
  const [showAiOverlay, setShowAiOverlay] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  async function analyseSprintWithAI() {
    if (aiAnalysing) return;
    aiAbortRef.current?.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    setAiOutput("");
    setShowAiOverlay(true);
    setAiAnalysing(true);

    const sprintTasks = Object.values(columns)
      .flat()
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee:
          users.find((u) => u.id === t.assignee_id)?.name ?? "Unassigned",
        due_date: t.due_date ?? null,
        story_points: t.story_points ?? null,
      }));

    try {
      const tok = localStorage.getItem("taskflow_token");
      const res = await fetch(`${AI_URL}/api/actions/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          template_id: 1,
          input: {
            action: "analyze_sprint",
            sprint_name: currentSprint?.name ?? "Backlog",
            sprint_goal: currentSprint?.goal ?? "",
            tasks: sprintTasks,
            total_tasks: sprintTasks.length,
            done_count: sprintTasks.filter((t) => t.status === "done").length,
            blocked_count: sprintTasks.filter((t) => t.status === "blocked")
              .length,
          },
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error("AI request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "chunk" && evt.content)
              setAiOutput((p) => p + evt.content);
            else if (evt.type === "step" && evt.step?.output)
              setAiOutput((p) => p + evt.step.output);
            else if (evt.type === "error")
              setAiOutput((p) => p + "\n\n⚠️ " + evt.message);
          } catch {
            /* non-JSON SSE */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAiOutput(
          "⚠️ Could not connect to AI service. Make sure the AI container is running.",
        );
      }
    } finally {
      setAiAnalysing(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load project, sprints, tasks, users ────────────────────────────────────
  useEffect(() => {
    if (!projectId || !token) return;
    setLoading(true);
    Promise.all([
      request<Project & { tasks: Task[] }>(`/projects/${projectId}`, { token }),
      request<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`, {
        token,
      }),
      request<{ users: User[] }>("/users", { token }),
    ])
      .then(([proj, sprintsRes, usersRes]) => {
        setProject(proj);
        setAllTasks(proj.tasks ?? []);
        setSprints(sprintsRes.sprints);
        setUsers(usersRes.users);

        // Auto-select active sprint if one exists
        const active = sprintsRes.sprints.find((s) => s.status === "active");
        if (active) setSelectedSprintId(active.id);
      })
      .catch(() => setError("Failed to load board"))
      .finally(() => setLoading(false));
  }, [projectId, token]);

  // ── Filter tasks into columns based on selected sprint ────────────────────
  useEffect(() => {
    let filtered: Task[];
    if (selectedSprintId === "backlog") {
      filtered = allTasks.filter((t) => !t.sprint_id && !t.parent_id);
    } else {
      filtered = allTasks.filter(
        (t) => t.sprint_id === selectedSprintId && !t.parent_id,
      );
    }
    const sorted = [...filtered].sort((a, b) => a.position - b.position);
    setColumns({
      todo: sorted.filter((t) => t.status === "todo"),
      in_progress: sorted.filter((t) => t.status === "in_progress"),
      blocked: sorted.filter((t) => t.status === "blocked"),
      in_review: sorted.filter((t) => t.status === "in_review"),
      done: sorted.filter((t) => t.status === "done"),
    });
  }, [allTasks, selectedSprintId]);

  // ── SSE real-time updates ──────────────────────────────────────────────────
  const handleEvent = useCallback((event: SSETaskEvent) => {
    if (
      event.type === "task_created" ||
      event.type === "task_updated" ||
      event.type === "task_moved"
    ) {
      setAllTasks((prev) =>
        prev.some((t) => t.id === event.data.id)
          ? prev.map((t) => (t.id === event.data.id ? event.data : t))
          : [event.data, ...prev],
      );
    } else if (event.type === "task_deleted") {
      setAllTasks((prev) => prev.filter((t) => t.id !== event.data.id));
    } else if (
      event.type === "sprint_started" ||
      event.type === "sprint_completed"
    ) {
      setSprints((prev) =>
        prev.map((s) => (s.id === event.data.id ? event.data : s)),
      );
    }
  }, []);

  const sseConnected = useProjectEvents(projectId, token, handleEvent);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const currentSprint = sprints.find((s) => s.id === selectedSprintId);
  const isOwnerOrAdmin =
    project?.owner_id === me?.id ||
    project?.members?.some(
      (m) => m.user_id === me?.id && (m.role === "admin" || m.role === "owner"),
    );
  const myRole =
    project?.members?.find((m) => m.user_id === me?.id)?.role ?? "viewer";
  const canEdit = myRole !== "viewer";

  function taskById(id: string): Task | undefined {
    for (const col of Object.values(columns)) {
      const t = col.find((t) => t.id === id);
      if (t) return t;
    }
    return undefined;
  }

  function columnOfTask(taskId: string): Task["status"] | undefined {
    for (const [col, tasks] of Object.entries(columns)) {
      if (tasks.some((t) => t.id === taskId)) return col as Task["status"];
    }
    return undefined;
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────
  function onDragStart(event: DragStartEvent) {
    const t = taskById(event.active.id as string);
    if (t) setActiveTask(t);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCol = columnOfTask(activeId);
    const overCol =
      COLUMNS.find((c) => c.id === overId)?.id ?? columnOfTask(overId);
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((prev) => {
      const activeTask = prev[activeCol].find((t) => t.id === activeId)!;
      const newCols = { ...prev };
      newCols[activeCol] = newCols[activeCol].filter((t) => t.id !== activeId);
      const overIndex = newCols[overCol].findIndex((t) => t.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : newCols[overCol].length;
      newCols[overCol] = [
        ...newCols[overCol].slice(0, insertAt),
        { ...activeTask, status: overCol },
        ...newCols[overCol].slice(insertAt),
      ];
      return newCols;
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !projectId || !token) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const targetCol =
      COLUMNS.find((c) => c.id === overId)?.id ?? columnOfTask(activeId);
    if (!targetCol) return;

    // Reorder within same column
    if (active.id !== over.id && columnOfTask(overId) === targetCol) {
      setColumns((prev) => {
        const col = prev[targetCol];
        const oldIdx = col.findIndex((t) => t.id === activeId);
        const newIdx = col.findIndex((t) => t.id === overId);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return { ...prev, [targetCol]: arrayMove(col, oldIdx, newIdx) };
      });
    }

    const task = taskById(activeId) ?? allTasks.find((t) => t.id === activeId);
    if (!task) return;

    const newPosition = columns[targetCol].findIndex((t) => t.id === activeId);
    try {
      const updated = await request<Task>(
        `/projects/${projectId}/tasks/${activeId}/position`,
        {
          method: "PATCH",
          token,
          body: {
            status: targetCol,
            position: newPosition >= 0 ? newPosition : 0,
            sprintId: selectedSprintId === "backlog" ? "" : selectedSprintId,
          },
        },
      );
      setAllTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (_) {
      // Revert on failure
      setAllTasks((prev) => [...prev]);
    }
  }

  // ── Inline status change (from dropdown on card) ───────────────────────────
  async function handleStatusChange(task: Task, newStatus: Task["status"]) {
    if (!projectId || !token) return;
    // Optimistic update
    setAllTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );
    try {
      const updated = await request<Task>(
        `/projects/${projectId}/tasks/${task.id}/position`,
        {
          method: "PATCH",
          token,
          body: { status: newStatus, position: task.position },
        },
      );
      setAllTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (_) {
      // Revert
      setAllTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  // ── Sprint actions ─────────────────────────────────────────────────────────
  async function startSprint(sprintId: string) {
    if (!projectId || !token) return;
    try {
      const updated = await request<Sprint>(
        `/projects/${projectId}/sprints/${sprintId}`,
        {
          method: "PATCH",
          token,
          body: { status: "active" },
        },
      );
      setSprints((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setSelectedSprintId(updated.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function completeSprint(sprintId: string) {
    if (!projectId || !token) return;
    try {
      const updated = await request<Sprint>(
        `/projects/${projectId}/sprints/${sprintId}`,
        {
          method: "PATCH",
          token,
          body: { status: "completed" },
        },
      );
      setSprints((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function addTaskToSprint(taskId: string, sprintId: string) {
    if (!projectId || !token) return;
    try {
      const updated = await request<Task>(
        `/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`,
        {
          method: "POST",
          token,
        },
      );
      setAllTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <Layout sidebar={<ProjectSidebar projectId={projectId!} />}>
        <div style={{ padding: 32 }}>Loading board…</div>
      </Layout>
    );

  return (
    <Layout
      sidebar={<ProjectSidebar projectId={projectId!} />}
      backTo={`/projects/${projectId}`}
      backLabel="← Back to project"
    >
      <div style={{ padding: "16px 24px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {project?.name} — Board
          </h2>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {selectedSprintId !== "backlog" && (
              <button
                onClick={analyseSprintWithAI}
                disabled={aiAnalysing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(34,211,238,0.3)",
                  background: aiAnalysing
                    ? "rgba(34,211,238,0.1)"
                    : "rgba(34,211,238,0.06)",
                  color: "#22d3ee",
                  cursor: aiAnalysing ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {aiAnalysing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {aiAnalysing ? "Analysing…" : "AI Analyse Sprint"}
              </button>
            )}
            <span
              className={
                sseConnected
                  ? `${cx.liveBadge} ${cx.liveBadgeOn}`
                  : cx.liveBadge
              }
              title={sseConnected ? "Live" : "Offline"}
            />
          </div>
        </div>

        {error && (
          <div className={cx.errorBox} style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Sprint selector + actions bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <select
            className={cx.fieldSelect}
            value={selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <option value="backlog">Backlog (no sprint)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>

          {isOwnerOrAdmin && (
            <>
              <button
                className={cx.btnSecondary}
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => setShowCreateSprint(true)}
              >
                + New Sprint
              </button>
              {currentSprint && currentSprint.status === "planning" && (
                <button
                  className={cx.btn}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    background: "#16a34a",
                  }}
                  onClick={() => startSprint(currentSprint.id)}
                >
                  ▶ Start Sprint
                </button>
              )}
              {currentSprint && currentSprint.status === "active" && (
                <button
                  className={cx.btn}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    background: "#7c3aed",
                  }}
                  onClick={() => completeSprint(currentSprint.id)}
                >
                  ✓ Complete Sprint
                </button>
              )}
            </>
          )}

          <div style={{ marginLeft: "auto" }}>
            <button
              className={cx.btn}
              style={{ fontSize: 12, padding: "5px 14px" }}
              onClick={() => setShowCreateTask(true)}
            >
              + New Task
            </button>
          </div>
        </div>

        {/* Sprint goal */}
        {currentSprint?.goal && (
          <div
            style={{
              background: "var(--pill-bg)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            <strong>Goal:</strong> {currentSprint.goal}
          </div>
        )}

        {/* Kanban board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              overflowX: "auto",
            }}
          >
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                col={col}
                tasks={columns[col.id]}
                users={users}
                onOpen={(t) => setEditingTask(t)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && (
              <TaskCard
                task={activeTask}
                users={users}
                dragging
                style={{ width: 240 }}
              />
            )}
          </DragOverlay>
        </DndContext>

        {/* Backlog section — tasks not in current sprint */}
        {selectedSprintId !== "backlog" && (
          <BacklogSection
            projectId={projectId!}
            token={token!}
            sprints={sprints}
            sprintId={selectedSprintId}
            allTasks={allTasks}
            users={users}
            onAddToSprint={addTaskToSprint}
            onOpenTask={(t) => setEditingTask(t)}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateSprint && projectId && token && (
        <CreateSprintModal
          projectId={projectId}
          token={token}
          onCreated={(s) => setSprints((prev) => [...prev, s])}
          onClose={() => setShowCreateSprint(false)}
        />
      )}

      {(showCreateTask || editingTask) && projectId && (
        <TaskModal
          projectId={projectId}
          token={token}
          task={editingTask}
          users={users}
          sprints={sprints}
          currentUser={me}
          commentEvent={null}
          canEdit={canEdit}
          onClose={() => {
            setShowCreateTask(false);
            setEditingTask(null);
          }}
          onSaved={(saved) => {
            setAllTasks((prev) =>
              prev.some((t) => t.id === saved.id)
                ? prev.map((t) => (t.id === saved.id ? saved : t))
                : [saved, ...prev],
            );
            setShowCreateTask(false);
            setEditingTask(null);
          }}
          onOpenTask={(t) => setEditingTask(t)}
        />
      )}

      {/* AI Sprint Analysis overlay card */}
      {showAiOverlay && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: "min(480px, calc(100vw - 48px))",
            maxHeight: "60vh",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            overflow: "hidden",
            background: "#0d1117",
            border: "1px solid rgba(34,211,238,0.2)",
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.08)",
          }}
        >
          {/* Card header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              borderBottom: "1px solid rgba(34,211,238,0.1)",
              flexShrink: 0,
              background: "rgba(34,211,238,0.04)",
            }}
          >
            <Sparkles size={14} style={{ color: "#22d3ee" }} />
            <span
              style={{
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "#e2e8f0",
                flex: 1,
              }}
            >
              AI Sprint Analysis
              {currentSprint && (
                <span
                  style={{ fontWeight: 400, color: "#64748b", marginLeft: 6 }}
                >
                  — {currentSprint.name}
                </span>
              )}
            </span>
            {aiAnalysing && (
              <Loader2
                size={13}
                className="animate-spin"
                style={{ color: "#22d3ee" }}
              />
            )}
            <button
              onClick={() => {
                setShowAiOverlay(false);
                aiAbortRef.current?.abort();
                setAiAnalysing(false);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748b",
                display: "flex",
                padding: 3,
                borderRadius: 5,
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Output */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 16px",
              fontSize: "0.8rem",
              lineHeight: 1.7,
              color: "#94a3b8",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {aiOutput ? (
              <>
                {aiOutput}
                {aiAnalysing && (
                  <span style={{ color: "#22d3ee" }} className="animate-pulse">
                    █
                  </span>
                )}
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#475569",
                }}
              >
                <Loader2
                  size={14}
                  className="animate-spin"
                  style={{ color: "#22d3ee" }}
                />
                Connecting to AI service…
              </div>
            )}
          </div>

          {/* Footer */}
          {!aiAnalysing && aiOutput && (
            <div
              style={{
                padding: "8px 16px",
                borderTop: "1px solid rgba(34,211,238,0.07)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => {
                  setAiOutput("");
                  analyseSprintWithAI();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(34,211,238,0.2)",
                  background: "transparent",
                  color: "#22d3ee",
                  cursor: "pointer",
                }}
              >
                <Sparkles size={10} /> Re-analyse
              </button>
              <button
                onClick={() => setShowAiOverlay(false)}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "transparent",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

// ─── Backlog section ──────────────────────────────────────────────────────────

function BacklogSection({
  projectId,
  token,
  sprints,
  sprintId,
  allTasks,
  users,
  onAddToSprint,
  onOpenTask,
}: {
  projectId: string;
  token: string;
  sprints: Sprint[];
  sprintId: string;
  allTasks: Task[];
  users: User[];
  onAddToSprint: (taskId: string, sprintId: string) => void;
  onOpenTask: (t: Task) => void;
}) {
  const backlog = allTasks.filter((t) => !t.sprint_id && !t.parent_id);
  if (backlog.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        Backlog ({backlog.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {backlog.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 12px",
              boxShadow: "0 1px 3px var(--shadow)",
              cursor: "pointer",
            }}
            onClick={() => onOpenTask(t)}
          >
            {/* Type icon */}
            <TypeIcon type={t.type} size={13} style={{ flexShrink: 0 }} />

            {/* Title */}
            <span
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t.title}
            </span>

            {/* Priority dot */}
            <span
              title={t.priority}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  t.priority === "high"
                    ? "#ef4444"
                    : t.priority === "medium"
                      ? "#f59e0b"
                      : "#3b82f6",
              }}
            />

            {/* Due date */}
            {t.due_date && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background:
                    new Date(t.due_date) < new Date(new Date().toDateString())
                      ? "#fee2e2"
                      : "var(--pill-bg)",
                  color:
                    new Date(t.due_date) < new Date(new Date().toDateString())
                      ? "#b91c1c"
                      : "var(--text-muted)",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                {new Date(t.due_date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}

            {/* Assignee avatar */}
            {users.find((u) => u.id === t.assignee_id) && (
              <span
                className={cx.memberAvatarSm}
                title={users.find((u) => u.id === t.assignee_id)?.name}
                style={{ fontSize: 9, width: 20, height: 20, flexShrink: 0 }}
              >
                {users
                  .find((u) => u.id === t.assignee_id)!
                  .name.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            )}

            <button
              className={cx.btnSecondary}
              style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                onAddToSprint(t.id, sprintId);
              }}
            >
              + Add to sprint
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
