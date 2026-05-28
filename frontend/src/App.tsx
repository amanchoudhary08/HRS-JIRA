import { createRoot } from "react-dom/client";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { Protected } from "./components/Protected";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OAuth2CallbackPage } from "./pages/OAuth2CallbackPage";
import { ApiReferencePage } from "./pages/ApiReferencePage";
import { PipelinePage } from "./pages/PipelinePage";
import "./main.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#1a2744",
                color: "#e8f0fe",
                border: "1px solid rgba(34,211,238,0.2)",
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
            <Route
              path="/projects"
              element={
                <Protected>
                  <ProjectsPage />
                </Protected>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <Protected>
                  <ProjectDetailPage />
                </Protected>
              }
            />
            <Route
              path="/projects/:id/board"
              element={
                <Protected>
                  <BoardPage />
                </Protected>
              }
            />
            <Route
              path="/projects/:id/dashboard"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/api"
              element={
                <Protected>
                  <ApiReferencePage />
                </Protected>
              }
            />
            <Route
              path="/projects/:id/pipeline"
              element={
                <Protected>
                  <PipelinePage />
                </Protected>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
