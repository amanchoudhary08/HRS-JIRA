import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { Field } from "../components/Field";
import type { Project, ProjectMember } from "../types";

function avatarInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MemberAvatars({ members }: { members: ProjectMember[] }) {
  const visible = members.slice(0, 5);
  const overflow = members.length - visible.length;
  return (
    <div className="avatar-stack">
      {visible.map((m) => (
        <div
          className="member-avatar member-avatar--sm"
          key={m.user_id}
          title={m.user_name}
        >
          {avatarInitials(m.user_name)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="member-avatar member-avatar--sm member-avatar--overflow"
          title={`+${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

export function ProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 12;

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await request<{ projects: Project[]; total: number }>(
        `/projects?page=${p}&limit=${LIMIT}`,
        { token },
      );
      setProjects(data.projects);
      setTotal(data.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(page);
  }, [page]);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Project name is required.");
    try {
      const project = await request<Project>("/projects", {
        method: "POST",
        token,
        body: { name, description },
      });
      setProjects((prev) => [project, ...prev]);
      setTotal((t) => t + 1);
      setName("");
      setDescription("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <Layout>
      <div className="toolbar">
        <div>
          <h1 className="title">Projects</h1>
          <p className="subtitle">Work you own or have tasks assigned in.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="card stack" onSubmit={createProject}>
        <div className="grid">
          <Field label="Project name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mobile release"
            />
          </Field>
          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
            />
          </Field>
        </div>
        <button className="button">Create project</button>
      </form>
      <div style={{ height: 20 }} />
      {loading ? (
        <div className="empty">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          No projects yet. Create one to start planning.
        </div>
      ) : (
        <>
          <div className="grid">
            {projects.map((project) => (
              <Link
                className="card project-link"
                key={project.id}
                to={`/projects/${project.id}`}
              >
                <h2>{project.name}</h2>
                <p className="muted">
                  {project.description || "No description yet."}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  {project.members && project.members.length > 0 ? (
                    <MemberAvatars members={project.members} />
                  ) : (
                    <span />
                  )}
                  <span className="pill">Open</span>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="button secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
