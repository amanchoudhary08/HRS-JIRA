import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import * as cx from "../styles/classes";

interface ProjectSidebarProps {
  projectId: string;
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
  const isBoard = location.pathname.endsWith("/board");
  const isDashboard = location.pathname.endsWith("/dashboard");

  function handleTab(tab: string) {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      navigate(`/projects/${projectId}?tab=${tab}`);
    }
  }

  const isActive = (tab: string) =>
    activeTab === tab && !isBoard && !isDashboard;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        className={isActive("tasks") ? cx.sidebarBtnActive : cx.sidebarBtn}
        onClick={() => handleTab("tasks")}
      >
        Tasks
      </button>
      <button
        className={isActive("members") ? cx.sidebarBtnActive : cx.sidebarBtn}
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
        className={isActive("activity") ? cx.sidebarBtnActive : cx.sidebarBtn}
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
    </div>
  );
}
