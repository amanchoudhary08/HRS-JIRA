import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { ProjectSidebar } from "../components/ProjectSidebar";
import * as cx from "../styles/classes";
import type { Project, ProjectStats, Sprint, Task } from "../types";

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  blocked: "#ef4444",
  in_review: "#a855f7",
  done: "#22c55e",
};

const TYPE_COLORS = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b"];

const TYPE_LABELS: Record<string, string> = {
  task: "Task",
  bug: "Bug",
  story: "Story",
  epic: "Epic",
};

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div
      className={cx.card}
      style={{
        padding: "1.25rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 120,
        flex: "1 1 140px",
      }}
    >
      <span
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: color ?? "var(--text)",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sprintVelocity, setSprintVelocity] = useState<number | null>(null);

  useEffect(() => {
    if (!id || !token) return;
    Promise.all([
      request<Project & { tasks: Task[] }>(`/projects/${id}`, { token }),
      request<ProjectStats>(`/projects/${id}/stats`, { token }),
      request<{ sprints: Sprint[] }>(`/projects/${id}/sprints`, { token }),
    ])
      .then(([proj, s, { sprints }]) => {
        setProject(proj as Project);
        setStats(s as ProjectStats);
        const activeSprint = sprints.find((sp) => sp.status === "active");
        if (activeSprint && proj.tasks) {
          const velocity = proj.tasks
            .filter(
              (t) =>
                t.sprint_id === activeSprint.id &&
                t.status === "done" &&
                t.story_points != null,
            )
            .reduce((sum, t) => sum + (t.story_points ?? 0), 0);
          setSprintVelocity(velocity);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <Layout sidebar={<ProjectSidebar projectId={id!} />}>
        <p style={{ padding: "2rem", color: "var(--text-muted)" }}>
          Loading dashboard…
        </p>
      </Layout>
    );
  }

  if (error || !stats) {
    return (
      <Layout sidebar={<ProjectSidebar projectId={id!} />}>
        <p className={cx.errorBox} style={{ margin: "2rem" }}>
          {error || "Failed to load stats."}
        </p>
      </Layout>
    );
  }

  const inProgress = stats.by_status.in_progress ?? 0;
  const done = stats.by_status.done ?? 0;
  const open = stats.by_status.todo ?? 0;

  // Pie data for status
  const statusPieData = [
    { name: "To Do", value: open, key: "todo" },
    { name: "In Progress", value: inProgress, key: "in_progress" },
    { name: "Blocked", value: stats.by_status.blocked ?? 0, key: "blocked" },
    {
      name: "In Review",
      value: stats.by_status.in_review ?? 0,
      key: "in_review",
    },
    { name: "Done", value: done, key: "done" },
  ].filter((d) => d.value > 0);

  // Type pie data
  const typePieData = stats.by_type.map((t) => ({
    name: TYPE_LABELS[t.type] ?? t.type,
    value: t.count,
  }));

  // Bar data for assignee
  const assigneeBarData = stats.by_assignee.map((a) => ({
    name: a.name,
    count: a.count,
  }));

  // Sprint bar data
  const sprintBarData = stats.by_sprint.map((s) => ({
    name: s.sprint,
    count: s.count,
  }));

  // Line chart data – last 14 days
  const lineData = stats.daily_done.map((d) => {
    const date = new Date(d.date);
    const label = date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
    return { date: label, count: d.count };
  });

  return (
    <Layout
      sidebar={<ProjectSidebar projectId={id!} />}
      backTo={`/projects/${id}`}
      backLabel="← Back to project"
    >
      <div style={{ padding: "1.5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "1.5rem",
          }}
        >
          Dashboard
        </h1>

        {/* ── Stat cards ──────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <StatCard label="Total tasks" value={stats.total} />
          <StatCard label="To Do" value={open} color="#94a3b8" />
          <StatCard label="In Progress" value={inProgress} color="#3b82f6" />
          <StatCard label="Done" value={done} color="#22c55e" />
          <StatCard label="Overdue" value={stats.overdue} color="#ef4444" />
          {sprintVelocity !== null && (
            <StatCard
              label="Sprint velocity (pts)"
              value={sprintVelocity}
              color="var(--brand)"
            />
          )}
        </div>

        {/* ── Row 1: Status pie + Type pie ─────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Status Pie */}
          <div className={cx.card} style={{ padding: "1.25rem" }}>
            <h2
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              Tasks by Status
            </h2>
            {statusPieData.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine
                  >
                    {statusPieData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={STATUS_COLORS[entry.key] ?? "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Type Pie */}
          <div className={cx.card} style={{ padding: "1.25rem" }}>
            <h2
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              Tasks by Type
            </h2>
            {typePieData.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie
                    data={typePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine
                  >
                    {typePieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={TYPE_COLORS[i % TYPE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Row 2: Assignee bar + Sprint bar ─────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* By Assignee */}
          <div className={cx.card} style={{ padding: "1.25rem" }}>
            <h2
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              Tasks by Assignee
            </h2>
            {assigneeBarData.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={assigneeBarData}
                  margin={{ top: 0, right: 10, left: -20, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="var(--brand)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By Sprint */}
          <div className={cx.card} style={{ padding: "1.25rem" }}>
            <h2
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              Tasks by Sprint
            </h2>
            {sprintBarData.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={sprintBarData}
                  margin={{ top: 0, right: 10, left: -20, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Row 3: Tasks closed per day (burndown line) ── */}
        <div className={cx.card} style={{ padding: "1.25rem" }}>
          <h2
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              marginBottom: "1rem",
            }}
          >
            Tasks Closed Per Day (last 14 days)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={lineData}
              margin={{ top: 0, right: 20, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                name="Closed"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Layout>
  );
}
