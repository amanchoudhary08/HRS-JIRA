export type User = { id: string; name: string; email: string };

export type Label = {
  id: string;
  name: string;
  color: string;
  project_id: string;
};

export type SearchResult = {
  project_id: string;
  project_name: string;
  tasks: Task[];
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, string>;
  read: boolean;
  created_at: string;
};

export type ActivityEvent = {
  id: string;
  type: string;
  actor_name: string;
  payload: Record<string, string>;
  created_at: string;
  task_id: string | null;
  project_id: string;
};

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
  status: "todo" | "in_progress" | "blocked" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  type: "task" | "bug" | "story" | "epic";
  project_id: string;
  assignee_id: string | null;
  created_by: string;
  parent_id: string | null;
  sprint_id: string | null;
  position: number;
  due_date: string | null;
  story_points: number | null;
  created_at: string;
  updated_at: string;
  labels?: Label[];
};

export type Sprint = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "planning" | "active" | "completed";
  created_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type TaskLink = {
  id: string;
  source_task_id: string;
  source_task_title: string;
  target_task_id: string;
  target_task_title: string;
  link_type: "blocks" | "is_blocked_by" | "relates_to" | "duplicates";
  created_by_id: string;
};

export type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } }
  | { type: "task_moved"; data: Task }
  | { type: "comment_added"; data: Comment }
  | { type: "comment_updated"; data: Comment }
  | { type: "sprint_started"; data: Sprint }
  | { type: "sprint_completed"; data: Sprint }
  | {
      type: "comment_deleted";
      data: { id: string; task_id: string; project_id: string };
    }
  | { type: "activity_created"; data: ActivityEvent };

export type Attachment = {
  id: string;
  task_id: string;
  project_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_id: string;
  uploaded_by_name: string;
  created_at: string;
};

export type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loginWithToken: (token: string, user: User) => void;
};

export type ProjectStats = {
  total: number;
  overdue: number;
  by_status: {
    todo: number;
    in_progress: number;
    blocked: number;
    in_review: number;
    done: number;
  };
  by_assignee: { assignee_id: string; name: string; count: number }[];
  by_type: { type: string; count: number }[];
  by_sprint: { sprint: string; count: number }[];
  daily_done: { date: string; count: number }[];
};
