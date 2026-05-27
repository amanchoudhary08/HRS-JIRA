import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  BookOpen,
  Users,
  BarChart2,
  Sparkles,
  ChevronDown,
  UserCircle2,
} from "lucide-react";
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

  // Persist last known projectId so AI Workspace pages can restore it
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
      <AIWorkspaceSection location={location} />
    </div>
  );
}

const AI_LINKS = [
  { to: "/ai/agents", label: "Agents", icon: Bot },
  { to: "/ai/collaborate", label: "Collaborate", icon: Users },
  { to: "/ai/skills", label: "Skills", icon: BookOpen },
  { to: "/ai/personas", label: "Personas", icon: UserCircle2 },
  { to: "/ai/analytics", label: "AI Analytics", icon: BarChart2 },
];

function AIWorkspaceSection({
  location,
}: {
  location: ReturnType<typeof useLocation>;
}) {
  const [open, setOpen] = useState(true);
  const isAiActive = AI_LINKS.some((l) => location.pathname.startsWith(l.to));

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx.sidebarBtn}
        style={isAiActive ? { color: "#22d3ee" } : {}}
      >
        <Sparkles
          size={13}
          style={{ marginRight: 6, color: "#22d3ee", flexShrink: 0 }}
        />
        AI Workspace
        <ChevronDown
          size={12}
          style={{
            marginLeft: "auto",
            color: "#64748b",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div style={{ marginLeft: 8 }}>
          {AI_LINKS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={active ? cx.sidebarBtnActive : cx.sidebarBtn}
                style={{
                  textDecoration: "none",
                  fontSize: "0.8rem",
                  ...(active ? { color: "#22d3ee" } : {}),
                }}
              >
                <Icon
                  size={12}
                  style={{
                    marginRight: 6,
                    flexShrink: 0,
                    color: active ? "#22d3ee" : "#64748b",
                  }}
                />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
