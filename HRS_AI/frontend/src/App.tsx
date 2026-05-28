import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/Login";
import SignupPage from "./pages/Signup";
import DashboardPage from "./pages/Dashboard";
import OrgMapPage from "./pages/OrgMap";
import DepartmentPage from "./pages/Department";
import PersonasPage from "./pages/Personas";
import PersonaDetailPage from "./pages/PersonaDetail";
import SkillsPage from "./pages/Skills";
import SkillGeneratePage from "./pages/SkillGenerate";
import AgentsPage from "./pages/Agents";
import ExecutionDetailPage from "./pages/ExecutionDetail";
import ChatPage from "./pages/Chat";
import DocumentsPage from "./pages/Documents";
import AnalyticsPage from "./pages/Analytics";
import SettingsPage from "./pages/Settings";
import CollaboratePage from "./pages/Collaborate";
import SSOPage from "./pages/SSO";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuthStore();
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/sso" element={<SSOPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="org" element={<OrgMapPage />} />
        <Route path="departments/:id" element={<DepartmentPage />} />
        <Route path="personas" element={<PersonasPage />} />
        <Route path="personas/:slug" element={<PersonaDetailPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route
          path="skills/generate/:personaId"
          element={<SkillGeneratePage />}
        />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/executions/:id" element={<ExecutionDetailPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="collaborate" element={<CollaboratePage />} />
      </Route>
    </Routes>
  );
}
