export type User = { id: string; name: string; email: string };

export type ProjectMember = {
  project_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  members?: ProjectMember[];
};

export type Task = {
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

export type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } };

export type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};
