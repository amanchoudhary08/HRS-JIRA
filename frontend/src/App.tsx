import React, { createContext, FormEvent, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useParams } from "react-router-dom";
import "./main.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type User = { id: string; name: string; email: string };
type Project = { id: string; name: string; description: string; owner_id: string; created_at: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  project_id: string;
  assignee_id: string | null;
  created_by: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem("taskflow_token"));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("taskflow_user");
    return raw ? JSON.parse(raw) : null;
  });

  async function authenticate(path: string, body: unknown) {
    const data = await request<{ token: string; user: User }>(path, { method: "POST", body });
    localStorage.setItem("taskflow_token", data.token);
    localStorage.setItem("taskflow_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  async function registerAccount(name: string, email: string, password: string) {
    await request<{ token: string; user: User }>("/auth/register", { method: "POST", body: { name, email, password } });
  }

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    login: (email, password) => authenticate("/auth/login", { email, password }),
    register: registerAccount,
    logout: () => {
      localStorage.removeItem("taskflow_token");
      localStorage.removeItem("taskflow_user");
      setToken(null);
      setUser(null);
    }
  }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function request<T>(path: string, options: { method?: string; token?: string | null; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.fields ? Object.values(data.fields).join(", ") : data.error;
    throw new Error(detail || "Request failed");
  }
  return data as T;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <nav className="nav">
        <Link className="brand" to="/projects">TaskFlow</Link>
        <div className="nav-actions">
          <span>{user?.name}</span>
          <button className="button secondary" onClick={logout}>Logout</button>
        </div>
      </nav>
      <main className="page">{children}</main>
    </div>
  );
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Use a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "register" && name.trim().length < 2) return setError("Name is required.");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/projects");
      } else {
        await register(name, email, password);
        setRegistrationSuccess(true);
        window.setTimeout(() => navigate("/login"), 1600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-art">
        <h1>Shared project work, clear task ownership.</h1>
      </section>
      <section className="auth-panel">
        <form className="card auth-card stack" onSubmit={submit}>
          <div>
            <h2 className="title">{mode === "login" ? "Welcome back" : "Create account"}</h2>
            <p className="subtitle">Use the seed credentials or register a new user.</p>
          </div>
          {error && <div className="error">{error}</div>}
          {mode === "register" && <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>}
          <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Password">
            <div className="password-field">
              <input className="password-input" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="password-toggle"
                title={showPassword ? "Hide password" : "Show password"}
                type="button"
                onClick={() => setShowPassword(value => !value)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>
          <button className="button" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Log in" : "Register"}</button>
          <Link to={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Need an account?" : "Already registered?"}</Link>
        </form>
      </section>
      {registrationSuccess && (
        <div className="success-toast" role="status">
          <strong>You have successfully registered.</strong>
          <span>Taking you to login...</span>
        </div>
      )}
    </div>
  );
}

function ProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await request<{ projects: Project[] }>("/projects", { token });
      setProjects(data.projects);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Project name is required.");
    try {
      const project = await request<Project>("/projects", { method: "POST", token, body: { name, description } });
      setProjects([project, ...projects]);
      setName("");
      setDescription("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    }
  }

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
          <Field label="Project name"><input value={name} onChange={e => setName(e.target.value)} placeholder="Mobile release" /></Field>
          <Field label="Description"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" /></Field>
        </div>
        <button className="button">Create project</button>
      </form>
      <div style={{ height: 20 }} />
      {loading ? <div className="empty">Loading projects...</div> : projects.length === 0 ? <div className="empty">No projects yet. Create one to start planning.</div> : (
        <div className="grid">
          {projects.map(project => (
            <Link className="card project-link" key={project.id} to={`/projects/${project.id}`}>
              <h2>{project.name}</h2>
              <p className="muted">{project.description || "No description yet."}</p>
              <span className="pill">Open</span>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}

function ProjectDetailPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<(Project & { tasks: Task[] }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [detail, userData] = await Promise.all([
        request<Project & { tasks: Task[] }>(`/projects/${id}`, { token }),
        request<{ users: User[] }>("/users", { token })
      ]);
      setProject(detail);
      setTasks(detail.tasks);
      setUsers(userData.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project");
    } finally {
      setLoading(false);
    }
  }
  const filterMounted = React.useRef(false);

  useEffect(() => { void load(); }, [id]);

  useEffect(() => {
    if (!filterMounted.current) { filterMounted.current = true; return; }
    if (!id) return;
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (assignee) qs.set("assignee", assignee);
    request<{ tasks: Task[] }>(`/projects/${id}/tasks?${qs}`, { token })
      .then(data => setTasks(data.tasks))
      .catch(err => setError(err instanceof Error ? err.message : "Could not filter tasks"));
  }, [status, assignee]);

  async function optimisticStatus(task: Task, nextStatus: Task["status"]) {
    const previous = tasks;
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    try {
      const updated = await request<Task>(`/tasks/${task.id}`, { method: "PATCH", token, body: { status: nextStatus } });
      setTasks(current => current.map(t => t.id === task.id ? updated : t));
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Task update failed; reverted.");
    }
  }

  function upsertTask(task: Task) {
    setTasks(current => current.some(t => t.id === task.id) ? current.map(t => t.id === task.id ? task : t) : [task, ...current]);
    setShowCreate(false);
    setEditing(null);
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task?")) return;
    const previous = tasks;
    setTasks(tasks.filter(t => t.id !== taskId));
    try {
      await request(`/tasks/${taskId}`, { method: "DELETE", token });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Could not delete task");
    }
  }

  async function deleteProject() {
    if (!window.confirm("Delete this project and all its tasks?")) return;
    try {
      await request(`/projects/${id}`, { method: "DELETE", token });
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete project");
    }
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      const updated = await request<Project>(`/projects/${id}`, { method: "PATCH", token, body: { name: projectName, description: projectDescription } });
      setProject(prev => prev ? { ...prev, ...updated } : prev);
      setEditingProject(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update project");
    }
  }

  const grouped = {
    todo: tasks.filter(t => t.status === "todo"),
    in_progress: tasks.filter(t => t.status === "in_progress"),
    done: tasks.filter(t => t.status === "done")
  };

  return (
    <Layout>
      <Link to="/projects">Back to projects</Link>
      {loading ? <div className="empty">Loading project...</div> : project ? (
        <>
          {editingProject ? (
            <form className="card stack" style={{ marginBottom: 20 }} onSubmit={saveProject}>
              <Field label="Project name"><input value={projectName} onChange={e => setProjectName(e.target.value)} /></Field>
              <Field label="Description"><input value={projectDescription} onChange={e => setProjectDescription(e.target.value)} /></Field>
              <div className="row">
                <button className="button" type="submit">Save</button>
                <button className="button secondary" type="button" onClick={() => setEditingProject(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="toolbar">
              <div>
                <h1 className="title">{project.name}</h1>
                <p className="subtitle">{project.description || "No description yet."}</p>
              </div>
              <div className="row">
                {project.owner_id === user?.id && (
                  <>
                    <button className="button secondary" onClick={() => { setProjectName(project.name); setProjectDescription(project.description); setEditingProject(true); }}>Edit project</button>
                    <button className="button danger" onClick={deleteProject}>Delete project</button>
                  </>
                )}
                <button className="button" onClick={() => setShowCreate(true)}>New task</button>
              </div>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="card filters">
            <Field label="Status filter">
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </Field>
            <Field label="Assignee filter">
              <select value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">All assignees</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ height: 20 }} />
          {tasks.length === 0 ? <div className="empty">No tasks match this view.</div> : (
            <div className="grid">
              {(["todo", "in_progress", "done"] as const).map(key => (
                <section className="column" key={key}>
                  <h3>{labelStatus(key)} <span className="pill">{grouped[key].length}</span></h3>
                  {grouped[key].map(task => (
                    <article className="card task-card" key={task.id}>
                      <div>
                        <h3>{task.title}</h3>
                        <p className="muted">{task.description || "No description."}</p>
                      </div>
                      <div className="row">
                        <span className={`pill priority-${task.priority}`}>{task.priority}</span>
                        <span className="pill">{users.find(u => u.id === task.assignee_id)?.name || "Unassigned"}</span>
                      </div>
                      {task.due_date && <span className="muted">Due {task.due_date}</span>}
                      <div className="row">
                        <select value={task.status} onChange={e => optimisticStatus(task, e.target.value as Task["status"])}>
                          <option value="todo">Todo</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                        <button className="button secondary" onClick={() => setEditing(task)}>Edit</button>
                        <button className="button danger" onClick={() => deleteTask(task.id)}>Delete</button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
          {(showCreate || editing) && (
            <TaskModal
              projectId={id!}
              token={token}
              task={editing}
              users={users}
              currentUser={user}
              onClose={() => { setShowCreate(false); setEditing(null); }}
              onSaved={upsertTask}
            />
          )}
        </>
      ) : <div className="empty">Project not found.</div>}
    </Layout>
  );
}

function TaskModal({ projectId, token, task, users, currentUser, onClose, onSaved }: {
  projectId: string;
  token: string | null;
  task: Task | null;
  users: User[];
  currentUser: User | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "todo");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "medium");
  const [assignee, setAssignee] = useState(task?.assignee_id ?? currentUser?.id ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    try {
      const body = { title, description, status, priority, assignee_id: assignee || "", due_date: dueDate || "" };
      const saved = task
        ? await request<Task>(`/tasks/${task.id}`, { method: "PATCH", token, body })
        : await request<Task>(`/projects/${projectId}/tasks`, { method: "POST", token, body });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="card modal stack" onSubmit={submit}>
        <div className="toolbar">
          <h2 className="title">{task ? "Edit task" : "New task"}</h2>
          <button className="button secondary" type="button" onClick={onClose}>Close</button>
        </div>
        {error && <p className="error">{error}</p>}
        <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <div className="grid">
          <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value as Task["status"])}><option value="todo">Todo</option><option value="in_progress">In progress</option><option value="done">Done</option></select></Field>
          <Field label="Priority"><select value={priority} onChange={e => setPriority(e.target.value as Task["priority"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          <Field label="Assignee"><select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Due date"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        </div>
        <button className="button" disabled={saving}>{saving ? "Saving..." : "Save task"}</button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" x2="21" y1="3" y2="21" />
    </svg>
  );
}

function labelStatus(status: Task["status"]) {
  return status === "in_progress" ? "In progress" : status === "todo" ? "Todo" : "Done";
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/projects" element={<Protected><ProjectsPage /></Protected>} />
          <Route path="/projects/:id" element={<Protected><ProjectDetailPage /></Protected>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
