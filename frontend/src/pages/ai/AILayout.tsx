/**
 * AILayout — wraps all AI Workspace pages inside the standard HRS-JIRA
 * Layout so the top nav and left sidebar are always visible.
 * The main content area keeps the dark AI Workspace background.
 */
import { Outlet } from "react-router-dom";
import { Layout } from "../../components/Layout";
import { ProjectSidebar } from "../../components/ProjectSidebar";

export function AILayout() {
  const lastProjectId = sessionStorage.getItem("lastProjectId") ?? undefined;
  return (
    <Layout
      sidebar={<ProjectSidebar projectId={lastProjectId} />}
      mainStyle={{
        background: "var(--surface-0, #08050f)",
        color: "#f0f0ff",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      <Outlet />
    </Layout>
  );
}
