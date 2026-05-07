import { createRoot } from "react-dom/client";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Protected } from "./components/Protected";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import "./main.css";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
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
        </Routes>
      </Router>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
