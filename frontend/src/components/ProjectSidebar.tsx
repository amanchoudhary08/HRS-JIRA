import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import * as cx from "../styles/classes";

interface ProjectSidebarProps {
  projectId?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  memberCount?: number;
  labelCount?: number;
}

export function ProjectSidebar({
  projectId,
  activeTab,
  onTabChange,
  memberCount = 0,
  labelCount = 0,
}: ProjectSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Persist last known projectId so the project context can be restored.
  useEffect(() => {
    if (projectId) {
      sessionStorage.setItem("lastProjectId", projectId);
    }
  }, [projectId]);
  const isBoard = location.pathname.endsWith("/board");
  const isDashboard = location.pathname.endsWith("/dashboard");

  function handleTab(tab: string) {
    if (onTabChange) {
      onTabChange(tab);
    } else if (projectId) {
      navigate(`/projects/${projectId}?tab=${tab}`);
    }
  }

  const isActive = (tab: string) =>
    activeTab === tab && !isBoard && !isDashboard;

  async function handleHrsAiOpen() {
    const adminEmail = import.meta.env.VITE_HRS_AI_ADMIN_EMAIL;
    const adminPassword = import.meta.env.VITE_HRS_AI_ADMIN_PASSWORD;
    const hrsAiUrl = import.meta.env.VITE_HRS_AI_URL ?? "http://localhost:5174";
    try {
      const res = await fetch("/ai/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
        }),
      });
      if (!res.ok) throw new Error("SSO login failed");
      const { access_token, refresh_token } = await res.json();
      const url = new URL(`${hrsAiUrl}/sso`);
      url.searchParams.set("token", access_token);
      url.searchParams.set("refresh", refresh_token);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      window.open(hrsAiUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      {projectId && (
        <>
          <button
            className={isActive("tasks") ? cx.sidebarBtnActive : cx.sidebarBtn}
            onClick={() => handleTab("tasks")}
          >
            Tasks
          </button>
          <button
            className={
              isActive("members") ? cx.sidebarBtnActive : cx.sidebarBtn
            }
            onClick={() => handleTab("members")}
          >
            Members
            <span
              className={cx.pill}
              style={{ marginLeft: 6, fontSize: "0.75rem" }}
            >
              {memberCount}
            </span>
          </button>
          <button
            className={
              isActive("activity") ? cx.sidebarBtnActive : cx.sidebarBtn
            }
            onClick={() => handleTab("activity")}
          >
            Activity
          </button>
          <button
            className={isActive("labels") ? cx.sidebarBtnActive : cx.sidebarBtn}
            onClick={() => handleTab("labels")}
          >
            Labels
            <span
              className={cx.pill}
              style={{ marginLeft: 6, fontSize: "0.75rem" }}
            >
              {labelCount}
            </span>
          </button>
          <div className={cx.sidebarDivider} />
          <Link
            to={`/projects/${projectId}/board`}
            className={isBoard ? cx.sidebarBtnActive : cx.sidebarBtn}
            style={{ textDecoration: "none" }}
          >
            Board ⚡
          </Link>
          <Link
            to={`/projects/${projectId}/dashboard`}
            className={isDashboard ? cx.sidebarBtnActive : cx.sidebarBtn}
            style={{ textDecoration: "none" }}
          >
            Dashboard 📊
          </Link>
          <Link
            to={`/api?from=${projectId}`}
            className={
              location.pathname === "/api" ? cx.sidebarBtnActive : cx.sidebarBtn
            }
            style={{ textDecoration: "none" }}
          >
            API Docs 📋
          </Link>
          <Link
            to={`/projects/${projectId}/pipeline`}
            className={
              location.pathname.endsWith("/pipeline")
                ? cx.sidebarBtnActive
                : cx.sidebarBtn
            }
            style={{ textDecoration: "none" }}
          >
            Pipeline 🔀
          </Link>
          <div className={cx.sidebarDivider} />
        </>
      )}
      <button
        className={cx.sidebarBtn}
        onClick={handleHrsAiOpen}
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 4,
            background: "linear-gradient(135deg,#22d3ee,#6366f1)",
            color: "#000",
            fontSize: "0.6rem",
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          H
        </span>
        HRS-AI
      </button>
    </div>
  );
}
