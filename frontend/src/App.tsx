import { createRoot } from "react-dom/client";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useDarkMode } from "./hooks/useDarkMode";
import { Protected } from "./components/Protected";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import "./main.css";

function App() {
  const [dark, toggleDark, resetDark] = useDarkMode();
  return (
    <AuthProvider onLogout={resetDark}>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route
            path="/projects"
            element={
              <Protected>
                <ProjectsPage onToggleDark={toggleDark} dark={dark} />
              </Protected>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <Protected>
                <ProjectDetailPage onToggleDark={toggleDark} dark={dark} />
              </Protected>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
