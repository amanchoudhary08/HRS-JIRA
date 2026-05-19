import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ProjectSidebar } from "../components/ProjectSidebar";
import * as cx from "../styles/classes";

// ── Types ─────────────────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface Field {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  id: string;
  method: Method;
  path: string;
  auth: boolean;
  description: string;
  queryParams?: Field[];
  requestBody?: Field[];
  response: {
    status: number;
    shape: string;
    note?: string;
  };
}

interface Group {
  id: string;
  title: string;
  baseUrl?: string;
  endpoints: Endpoint[];
}

// ── Static API data ───────────────────────────────────────────────────────────

const API_GROUPS: Group[] = [
  {
    id: "auth",
    title: "Authentication",
    endpoints: [
      {
        id: "register",
        method: "POST",
        path: "/auth/register",
        auth: false,
        description: "Register a new user account.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "Full display name",
          },
          {
            name: "email",
            type: "string (email)",
            required: true,
            description: "Unique email address",
          },
          {
            name: "password",
            type: "string",
            required: true,
            description: "Minimum 8 characters",
          },
        ],
        response: {
          status: 201,
          shape: `{\n  "token": "eyJ...",\n  "user": { "id": "uuid", "name": "Alice", "email": "alice@example.com" }\n}`,
        },
      },
      {
        id: "login",
        method: "POST",
        path: "/auth/login",
        auth: false,
        description: "Login with email (or employee ID) and password.",
        requestBody: [
          {
            name: "email",
            type: "string",
            required: true,
            description: "Email address or employee ID",
          },
          {
            name: "password",
            type: "string",
            required: true,
            description: "Account password",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "token": "eyJ...",\n  "user": { "id": "uuid", "name": "Alice", "email": "alice@example.com" }\n}`,
        },
      },
      {
        id: "list-users",
        method: "GET",
        path: "/users",
        auth: true,
        description:
          "List all registered users. Used to populate assignee dropdowns.",
        response: {
          status: 200,
          shape: `{\n  "users": [\n    { "id": "uuid", "name": "Alice", "email": "alice@example.com" }\n  ]\n}`,
        },
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    baseUrl: "/projects",
    endpoints: [
      {
        id: "list-projects",
        method: "GET",
        path: "/projects",
        auth: true,
        description:
          "List all projects accessible to the current user (owned + member-of).",
        queryParams: [
          {
            name: "page",
            type: "integer",
            required: false,
            description: "Page number (default: 1)",
          },
          {
            name: "limit",
            type: "integer",
            required: false,
            description: "Items per page (default: 20, max: 100)",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "projects": [ProjectDto],\n  "page": 1,\n  "limit": 20,\n  "total": 5\n}`,
        },
      },
      {
        id: "create-project",
        method: "POST",
        path: "/projects",
        auth: true,
        description:
          "Create a new project. The creator is automatically added as 'owner' member.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "Project name (non-blank)",
          },
          {
            name: "description",
            type: "string",
            required: false,
            description: "Optional project description",
          },
        ],
        response: {
          status: 201,
          shape: `{\n  "id": "uuid",\n  "name": "My Project",\n  "description": "...",\n  "owner_id": "uuid",\n  "created_at": "2026-05-11T10:00:00Z"\n}`,
        },
      },
      {
        id: "get-project",
        method: "GET",
        path: "/projects/:id",
        auth: true,
        description:
          "Get a single project with its tasks and members. Requires project access.",
        response: {
          status: 200,
          shape: `{\n  "id": "uuid",\n  "name": "My Project",\n  "description": "...",\n  "owner_id": "uuid",\n  "created_at": "...",\n  "tasks": [TaskDto],\n  "members": [ProjectMemberDto]\n}`,
        },
      },
      {
        id: "update-project",
        method: "PATCH",
        path: "/projects/:id",
        auth: true,
        description: "Update project name or description. Owner-only.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: false,
            description: "New project name",
          },
          {
            name: "description",
            type: "string",
            required: false,
            description: "New description",
          },
        ],
        response: {
          status: 200,
          shape: `{ "id": "uuid", "name": "Updated Name", ... }`,
        },
      },
      {
        id: "delete-project",
        method: "DELETE",
        path: "/projects/:id",
        auth: true,
        description:
          "Permanently delete a project and all its data. Owner-only.",
        response: { status: 204, shape: "(no body)" },
      },
      {
        id: "project-stats",
        method: "GET",
        path: "/projects/:id/stats",
        auth: true,
        description:
          "Get aggregate statistics for a project — used by the Dashboard page.",
        response: {
          status: 200,
          shape: `{\n  "total": 42,\n  "overdue": 3,\n  "by_status": { "todo": 10, "in_progress": 5, "blocked": 2, "in_review": 3, "done": 22 },\n  "by_assignee": [{ "assignee_id": "uuid", "name": "Alice", "count": 7 }],\n  "by_type": [{ "type": "bug", "count": 4 }],\n  "by_sprint": [{ "sprint": "Sprint 1", "count": 12 }],\n  "daily_done": [{ "date": "2026-05-10", "count": 3 }]\n}`,
        },
      },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    baseUrl: "/projects/:projectId/tasks",
    endpoints: [
      {
        id: "list-tasks",
        method: "GET",
        path: "/projects/:projectId/tasks",
        auth: true,
        description:
          "List tasks in a project with optional status and assignee filters.",
        queryParams: [
          {
            name: "status",
            type: "string",
            required: false,
            description:
              "Filter by status: todo | in_progress | blocked | in_review | done",
          },
          {
            name: "assignee",
            type: "uuid",
            required: false,
            description: "Filter by assignee user ID",
          },
          {
            name: "page",
            type: "integer",
            required: false,
            description: "Page number (default: 1)",
          },
          {
            name: "limit",
            type: "integer",
            required: false,
            description: "Items per page (default: 20, max: 100)",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "tasks": [TaskDto],\n  "page": 1,\n  "limit": 20,\n  "total": 10\n}`,
        },
      },
      {
        id: "get-task",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId",
        auth: true,
        description: "Get a single task by ID.",
        response: { status: 200, shape: "TaskDto" },
      },
      {
        id: "create-task",
        method: "POST",
        path: "/projects/:projectId/tasks",
        auth: true,
        description:
          "Create a new task. Triggers 'task_created' SSE event and a notification to the assignee if different from creator.",
        requestBody: [
          {
            name: "title",
            type: "string",
            required: true,
            description: "Task title",
          },
          {
            name: "description",
            type: "string",
            required: false,
            description: "Optional description",
          },
          {
            name: "status",
            type: "string",
            required: false,
            description:
              "todo | in_progress | blocked | in_review | done (default: todo)",
          },
          {
            name: "priority",
            type: "string",
            required: false,
            description: "low | medium | high (default: medium)",
          },
          {
            name: "type",
            type: "string",
            required: false,
            description: "task | bug | story | epic (default: task)",
          },
          {
            name: "assigneeId",
            type: "uuid",
            required: false,
            description: "User ID to assign the task to",
          },
          {
            name: "dueDate",
            type: "string (YYYY-MM-DD)",
            required: true,
            description: "Due date",
          },
          {
            name: "parentId",
            type: "uuid",
            required: false,
            description: "Parent task ID to create a subtask",
          },
          {
            name: "sprintId",
            type: "uuid",
            required: false,
            description: "Sprint ID to add this task to",
          },
        ],
        response: { status: 201, shape: "TaskDto" },
      },
      {
        id: "update-task",
        method: "PATCH",
        path: "/projects/:projectId/tasks/:taskId",
        auth: true,
        description:
          "Update a task. Allowed for project owner, task creator, or current assignee. Triggers 'task_updated' SSE event.",
        requestBody: [
          {
            name: "title",
            type: "string",
            required: false,
            description: "New title",
          },
          {
            name: "description",
            type: "string",
            required: false,
            description: "New description (send empty string to clear)",
          },
          {
            name: "status",
            type: "string",
            required: false,
            description: "New status",
          },
          {
            name: "priority",
            type: "string",
            required: false,
            description: "New priority",
          },
          {
            name: "type",
            type: "string",
            required: false,
            description: "New task type",
          },
          {
            name: "assigneeId",
            type: "uuid | ''",
            required: false,
            description: "New assignee ID. Send empty string to unassign",
          },
          {
            name: "dueDate",
            type: "string (YYYY-MM-DD)",
            required: false,
            description: "New due date",
          },
          {
            name: "sprintId",
            type: "uuid | ''",
            required: false,
            description:
              "Move to a different sprint. Send empty string to move to backlog",
          },
        ],
        response: { status: 200, shape: "TaskDto" },
      },
      {
        id: "delete-task",
        method: "DELETE",
        path: "/projects/:projectId/tasks/:taskId",
        auth: true,
        description: "Delete a task. Triggers 'task_deleted' SSE event.",
        response: { status: 204, shape: "(no body)" },
      },
      {
        id: "move-task",
        method: "PATCH",
        path: "/projects/:projectId/tasks/:taskId/position",
        auth: true,
        description:
          "Move a task to a new status column (drag-and-drop). Triggers 'task_moved' SSE event.",
        requestBody: [
          {
            name: "status",
            type: "string",
            required: true,
            description:
              "Target column: todo | in_progress | blocked | in_review | done",
          },
          {
            name: "position",
            type: "integer",
            required: false,
            description: "Position index within the column",
          },
          {
            name: "sprintId",
            type: "uuid",
            required: false,
            description: "Target sprint if moving between sprints",
          },
        ],
        response: { status: 200, shape: "TaskDto" },
      },
      {
        id: "list-subtasks",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId/subtasks",
        auth: true,
        description: "List all direct subtasks of a task.",
        response: {
          status: 200,
          shape: `{ "subtasks": [TaskDto] }`,
        },
      },
    ],
  },
  {
    id: "search",
    title: "Search",
    endpoints: [
      {
        id: "search-in-project",
        method: "GET",
        path: "/projects/:projectId/tasks/search",
        auth: true,
        description:
          "Full-text search tasks within a single project. Requires at least 2 characters.",
        queryParams: [
          {
            name: "q",
            type: "string",
            required: true,
            description: "Search query (min 2 chars)",
          },
        ],
        response: { status: 200, shape: `{ "tasks": [TaskDto] }` },
      },
      {
        id: "global-search",
        method: "GET",
        path: "/search",
        auth: true,
        description:
          "Global full-text search across all projects accessible to the current user.",
        queryParams: [
          {
            name: "q",
            type: "string",
            required: true,
            description: "Search query (min 2 chars)",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "results": [\n    {\n      "project_id": "uuid",\n      "project_name": "My Project",\n      "tasks": [TaskDto]\n    }\n  ]\n}`,
        },
      },
    ],
  },
  {
    id: "labels",
    title: "Labels",
    baseUrl: "/projects/:projectId/labels",
    endpoints: [
      {
        id: "list-labels",
        method: "GET",
        path: "/projects/:projectId/labels",
        auth: true,
        description: "List all labels for a project, sorted alphabetically.",
        response: {
          status: 200,
          shape: `{\n  "labels": [\n    { "id": "uuid", "project_id": "uuid", "name": "bug", "color": "#ef4444" }\n  ]\n}`,
        },
      },
      {
        id: "create-label",
        method: "POST",
        path: "/projects/:projectId/labels",
        auth: true,
        description: "Create a new label for a project.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "Label name (unique within project)",
          },
          {
            name: "color",
            type: "string (#rrggbb)",
            required: false,
            description: "Hex color code (default: #6366f1)",
          },
        ],
        response: {
          status: 201,
          shape: `{ "id": "uuid", "project_id": "uuid", "name": "urgent", "color": "#ef4444" }`,
        },
      },
      {
        id: "update-label",
        method: "PATCH",
        path: "/projects/:projectId/labels/:labelId",
        auth: true,
        description: "Update a label's name or color.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: false,
            description: "New label name",
          },
          {
            name: "color",
            type: "string (#rrggbb)",
            required: false,
            description: "New hex color",
          },
        ],
        response: { status: 200, shape: `LabelDto` },
      },
      {
        id: "delete-label",
        method: "DELETE",
        path: "/projects/:projectId/labels/:labelId",
        auth: true,
        description: "Delete a label and detach it from all tasks.",
        response: { status: 204, shape: "(no body)" },
      },
      {
        id: "attach-label",
        method: "POST",
        path: "/projects/:projectId/tasks/:taskId/labels/:labelId",
        auth: true,
        description:
          "Attach a label to a task. Triggers 'task_updated' SSE event.",
        response: { status: 200, shape: "TaskDto (with updated labels array)" },
      },
      {
        id: "detach-label",
        method: "DELETE",
        path: "/projects/:projectId/tasks/:taskId/labels/:labelId",
        auth: true,
        description:
          "Detach a label from a task. Triggers 'task_updated' SSE event.",
        response: { status: 204, shape: "(no body)" },
      },
    ],
  },
  {
    id: "members",
    title: "Project Members",
    baseUrl: "/projects/:projectId/members",
    endpoints: [
      {
        id: "list-members",
        method: "GET",
        path: "/projects/:projectId/members",
        auth: true,
        description: "List all members of a project.",
        response: {
          status: 200,
          shape: `{\n  "members": [\n    {\n      "project_id": "uuid",\n      "user_id": "uuid",\n      "user_name": "Alice",\n      "user_email": "alice@example.com",\n      "role": "member",\n      "joined_at": "2026-05-01T10:00:00Z"\n    }\n  ]\n}`,
        },
      },
      {
        id: "invite-member",
        method: "POST",
        path: "/projects/:projectId/members",
        auth: true,
        description:
          "Invite an existing user to a project by email. Requires owner or admin role.",
        requestBody: [
          {
            name: "email",
            type: "string (email)",
            required: true,
            description: "Email of the user to invite",
          },
          {
            name: "role",
            type: "string",
            required: true,
            description: "Role to assign: admin | member | viewer",
          },
        ],
        response: { status: 201, shape: "ProjectMemberDto" },
      },
      {
        id: "update-member-role",
        method: "PATCH",
        path: "/projects/:projectId/members/:userId",
        auth: true,
        description:
          "Change a member's role. Requires owner or admin. Cannot change the owner's role.",
        requestBody: [
          {
            name: "role",
            type: "string",
            required: true,
            description: "New role: admin | member | viewer",
          },
        ],
        response: { status: 200, shape: "ProjectMemberDto" },
      },
      {
        id: "remove-member",
        method: "DELETE",
        path: "/projects/:projectId/members/:userId",
        auth: true,
        description: "Remove a member from a project. Requires owner or admin.",
        response: { status: 204, shape: "(no body)" },
      },
    ],
  },
  {
    id: "sprints",
    title: "Sprints",
    baseUrl: "/projects/:projectId/sprints",
    endpoints: [
      {
        id: "list-sprints",
        method: "GET",
        path: "/projects/:projectId/sprints",
        auth: true,
        description:
          "List all sprints for a project, ordered by creation date.",
        response: {
          status: 200,
          shape: `{\n  "sprints": [\n    {\n      "id": "uuid",\n      "project_id": "uuid",\n      "name": "Sprint 1",\n      "goal": "Ship auth",\n      "start_date": "2026-05-01",\n      "end_date": "2026-05-14",\n      "status": "active",\n      "created_at": "..."\n    }\n  ]\n}`,
        },
      },
      {
        id: "create-sprint",
        method: "POST",
        path: "/projects/:projectId/sprints",
        auth: true,
        description: "Create a new sprint.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "Sprint name",
          },
          {
            name: "goal",
            type: "string",
            required: false,
            description: "Sprint goal description",
          },
          {
            name: "startDate",
            type: "string (YYYY-MM-DD)",
            required: true,
            description: "Sprint start date",
          },
          {
            name: "endDate",
            type: "string (YYYY-MM-DD)",
            required: true,
            description: "Sprint end date (must be ≥ startDate)",
          },
        ],
        response: { status: 201, shape: "SprintDto" },
      },
      {
        id: "update-sprint",
        method: "PATCH",
        path: "/projects/:projectId/sprints/:sprintId",
        auth: true,
        description:
          "Update sprint fields or change status (start/complete). Triggers 'sprint_started' or 'sprint_completed' SSE events.",
        requestBody: [
          {
            name: "name",
            type: "string",
            required: false,
            description: "New sprint name",
          },
          {
            name: "goal",
            type: "string",
            required: false,
            description: "New sprint goal",
          },
          {
            name: "startDate",
            type: "string",
            required: false,
            description: "New start date",
          },
          {
            name: "endDate",
            type: "string",
            required: false,
            description: "New end date",
          },
          {
            name: "status",
            type: "string",
            required: false,
            description: "planning | active | completed",
          },
        ],
        response: { status: 200, shape: "SprintDto" },
      },
      {
        id: "delete-sprint",
        method: "DELETE",
        path: "/projects/:projectId/sprints/:sprintId",
        auth: true,
        description: "Delete a sprint. Tasks are moved back to the backlog.",
        response: { status: 204, shape: "(no body)" },
      },
      {
        id: "add-task-to-sprint",
        method: "POST",
        path: "/projects/:projectId/sprints/:sprintId/tasks/:taskId",
        auth: true,
        description: "Add a task to a sprint (move from backlog).",
        response: { status: 200, shape: "TaskDto" },
      },
      {
        id: "remove-task-from-sprint",
        method: "DELETE",
        path: "/projects/:projectId/sprints/:sprintId/tasks/:taskId",
        auth: true,
        description: "Remove a task from a sprint (move back to backlog).",
        response: { status: 204, shape: "(no body)" },
      },
    ],
  },
  {
    id: "comments",
    title: "Comments",
    baseUrl: "/projects/:projectId/tasks/:taskId/comments",
    endpoints: [
      {
        id: "list-comments",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId/comments",
        auth: true,
        description: "List all comments on a task, ordered oldest-first.",
        response: {
          status: 200,
          shape: `{\n  "comments": [\n    {\n      "id": "uuid",\n      "task_id": "uuid",\n      "author_id": "uuid",\n      "author_name": "Alice",\n      "body": "Looks good!",\n      "created_at": "...",\n      "updated_at": "..."\n    }\n  ]\n}`,
        },
      },
      {
        id: "create-comment",
        method: "POST",
        path: "/projects/:projectId/tasks/:taskId/comments",
        auth: true,
        description:
          "Add a comment. Triggers 'comment_added' SSE event and a notification to the task creator.",
        requestBody: [
          {
            name: "body",
            type: "string",
            required: true,
            description: "Comment body (non-blank)",
          },
        ],
        response: { status: 201, shape: "CommentDto" },
      },
      {
        id: "update-comment",
        method: "PATCH",
        path: "/projects/:projectId/tasks/:taskId/comments/:commentId",
        auth: true,
        description:
          "Edit a comment. Only the comment author can edit. Triggers 'comment_updated' SSE event.",
        requestBody: [
          {
            name: "body",
            type: "string",
            required: true,
            description: "Updated comment body",
          },
        ],
        response: { status: 200, shape: "CommentDto" },
      },
      {
        id: "delete-comment",
        method: "DELETE",
        path: "/projects/:projectId/tasks/:taskId/comments/:commentId",
        auth: true,
        description:
          "Delete a comment. Author or project owner only. Triggers 'comment_deleted' SSE event.",
        response: { status: 204, shape: "(no body)" },
      },
    ],
  },
  {
    id: "attachments",
    title: "Attachments",
    baseUrl: "/projects/:projectId/tasks/:taskId/attachments",
    endpoints: [
      {
        id: "list-attachments",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId/attachments",
        auth: true,
        description: "List all attachments on a task, ordered oldest-first.",
        response: {
          status: 200,
          shape: `{\n  "attachments": [\n    {\n      "id": "uuid",\n      "task_id": "uuid",\n      "uploaded_by_id": "uuid",\n      "uploaded_by_name": "Alice",\n      "filename": "screenshot.png",\n      "mime_type": "image/png",\n      "size_bytes": 204800,\n      "created_at": "2026-05-11T10:00:00Z"\n    }\n  ]\n}`,
        },
      },
      {
        id: "download-attachment",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download",
        auth: true,
        description:
          "Download an attachment. The API streams the file bytes from object storage — the browser never talks to MinIO directly. Responds with the file's Content-Type and Content-Disposition headers.",
        response: {
          status: 200,
          shape: `(binary file stream)\nContent-Disposition: inline; filename="screenshot.png"\nContent-Type: image/png\nContent-Length: 204800`,
          note: "Pass the JWT in the Authorization header. Presigned URLs are not used.",
        },
      },
      {
        id: "upload-attachment",
        method: "POST",
        path: "/projects/:projectId/tasks/:taskId/attachments",
        auth: true,
        description:
          "Upload a file as an attachment to a task. Request must be multipart/form-data. Max file size: 50 MB. Allowed MIME types: images, PDFs, plain text, and common office documents.",
        requestBody: [
          {
            name: "file",
            type: "File (multipart field)",
            required: true,
            description: "The file to upload. Max 50 MB.",
          },
        ],
        response: {
          status: 201,
          shape: `{\n  "id": "uuid",\n  "task_id": "uuid",\n  "uploaded_by_id": "uuid",\n  "uploaded_by_name": "Alice",\n  "filename": "screenshot.png",\n  "mime_type": "image/png",\n  "size_bytes": 204800,\n  "created_at": "2026-05-11T10:00:00Z"\n}`,
        },
      },
      {
        id: "delete-attachment",
        method: "DELETE",
        path: "/projects/:projectId/tasks/:taskId/attachments/:attachmentId",
        auth: true,
        description:
          "Delete an attachment and remove it from object storage. Only the uploader or the project owner may delete.",
        response: { status: 204, shape: "(no body)" },
      },
    ],
  },
  {
    id: "activity",
    title: "Activity Log",
    endpoints: [
      {
        id: "project-activity",
        method: "GET",
        path: "/projects/:projectId/activity",
        auth: true,
        description: "List all activity events for a project, newest-first.",
        queryParams: [
          {
            name: "page",
            type: "integer",
            required: false,
            description: "Page number (default: 1)",
          },
          {
            name: "limit",
            type: "integer",
            required: false,
            description: "Items per page (default: 30)",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "events": [\n    {\n      "id": "uuid",\n      "project_id": "uuid",\n      "task_id": "uuid | null",\n      "actor_id": "uuid",\n      "actor_name": "Alice",\n      "type": "task_created",\n      "payload": { "title": "Fix login" },\n      "created_at": "..."\n    }\n  ],\n  "page": 1, "limit": 30, "total": 42\n}`,
        },
      },
      {
        id: "task-activity",
        method: "GET",
        path: "/projects/:projectId/tasks/:taskId/activity",
        auth: true,
        description: "List activity events scoped to a single task.",
        response: { status: 200, shape: `{ "events": [ActivityEventDto] }` },
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    baseUrl: "/notifications",
    endpoints: [
      {
        id: "list-notifications",
        method: "GET",
        path: "/notifications",
        auth: true,
        description:
          "List notifications for the current user. Unread items appear first.",
        queryParams: [
          {
            name: "page",
            type: "integer",
            required: false,
            description: "Page number (default: 1)",
          },
          {
            name: "limit",
            type: "integer",
            required: false,
            description: "Items per page (default: 20, max: 100)",
          },
        ],
        response: {
          status: 200,
          shape: `{\n  "notifications": [\n    {\n      "id": "uuid",\n      "user_id": "uuid",\n      "type": "task_assigned",\n      "payload": { "taskId": "uuid", "taskTitle": "Fix bug", "projectId": "uuid", "assignedBy": "Alice" },\n      "read": false,\n      "created_at": "..."\n    }\n  ],\n  "page": 1, "limit": 20, "total": 5\n}`,
        },
      },
      {
        id: "notification-count",
        method: "GET",
        path: "/notifications/count",
        auth: true,
        description:
          "Get the number of unread notifications for the current user. Used for the bell badge.",
        response: { status: 200, shape: `{ "unread": 3 }` },
      },
      {
        id: "mark-notification-read",
        method: "PATCH",
        path: "/notifications/:id/read",
        auth: true,
        description: "Mark a single notification as read.",
        response: { status: 200, shape: "NotificationDto" },
      },
      {
        id: "mark-all-read",
        method: "PATCH",
        path: "/notifications/read-all",
        auth: true,
        description: "Mark all notifications for the current user as read.",
        response: { status: 200, shape: `{ "ok": true }` },
      },
    ],
  },
  {
    id: "sse",
    title: "Real-time Events (SSE)",
    endpoints: [
      {
        id: "project-events",
        method: "GET",
        path: "/projects/:projectId/events",
        auth: true,
        description:
          "Open a Server-Sent Events stream for a project. Receives live task, sprint, and comment events. Auth token must be passed as a query parameter (browsers cannot set Authorization headers for EventSource).",
        queryParams: [
          {
            name: "token",
            type: "string (JWT)",
            required: true,
            description: "Bearer token for authentication",
          },
        ],
        response: {
          status: 200,
          shape: `Content-Type: text/event-stream\n\nevent: task_created\ndata: { ...TaskDto }\n\nevent: task_updated\ndata: { ...TaskDto }\n\nevent: task_deleted\ndata: { "id": "uuid", "project_id": "uuid" }\n\nevent: task_moved\ndata: { ...TaskDto }\n\nevent: sprint_started\ndata: { ...SprintDto }\n\nevent: sprint_completed\ndata: { ...SprintDto }\n\nevent: comment_added\ndata: { ...CommentDto }\n\nevent: comment_updated\ndata: { ...CommentDto }\n\nevent: comment_deleted\ndata: { "id": "uuid", "task_id": "uuid", "project_id": "uuid" }\n\nevent: activity_created\ndata: { ...ActivityEventDto }`,
          note: "Connection auto-closes after 5 minutes; the client should reconnect.",
        },
      },
      {
        id: "notification-events",
        method: "GET",
        path: "/notifications/events",
        auth: true,
        description:
          "Open a personal SSE channel for the current user. Receives live notification pushes whenever a task is assigned to you or someone comments on your task.",
        response: {
          status: 200,
          shape: `Content-Type: text/event-stream\n\nevent: notification\ndata: { ...NotificationDto }`,
          note: "Token passed in Authorization header (standard JWT filter handles it).",
        },
      },
    ],
  },
  {
    id: "health",
    title: "Health",
    endpoints: [
      {
        id: "healthz",
        method: "GET",
        path: "/healthz",
        auth: false,
        description:
          "Simple health check endpoint. Returns 'ok' when the server is running.",
        response: { status: 200, shape: `"ok"` },
      },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<Method, { bg: string; text: string }> = {
  GET: { bg: "#dbeafe", text: "#1e40af" },
  POST: { bg: "#dcfce7", text: "#166534" },
  PATCH: { bg: "#fef9c3", text: "#713f12" },
  DELETE: { bg: "#fee2e2", text: "#991b1b" },
};

function MethodBadge({ method }: { method: Method }) {
  const colors = METHOD_COLORS[method];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: colors.bg,
        color: colors.text,
        minWidth: 52,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      {method}
    </span>
  );
}

function AuthBadge({ required }: { required: boolean }) {
  if (!required)
    return (
      <span
        style={{
          fontSize: "0.72rem",
          padding: "2px 7px",
          borderRadius: 20,
          background: "#f0fdf4",
          color: "#166534",
          fontWeight: 600,
          border: "1px solid #bbf7d0",
        }}
      >
        public
      </span>
    );
  return (
    <span
      style={{
        fontSize: "0.72rem",
        padding: "2px 7px",
        borderRadius: 20,
        background: "#f5f3ff",
        color: "#5b21b6",
        fontWeight: 600,
        border: "1px solid #ddd6fe",
      }}
    >
      🔒 JWT
    </span>
  );
}

function FieldsTable({ fields, label }: { fields: Field[]; label: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.82rem",
        }}
      >
        <thead>
          <tr
            style={{
              background: "var(--color-bg)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {["Name", "Type", "Required", "Description"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "5px 10px",
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  fontSize: "0.78rem",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr
              key={f.name}
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <td
                style={{
                  padding: "6px 10px",
                  fontFamily: "monospace",
                  color: "var(--color-brand)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {f.name}
              </td>
              <td
                style={{
                  padding: "6px 10px",
                  fontFamily: "monospace",
                  color: "var(--color-text-muted)",
                  fontSize: "0.78rem",
                }}
              >
                {f.type}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                {f.required ? (
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>✱</span>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>—</span>
                )}
              </td>
              <td style={{ padding: "6px 10px", color: "var(--color-text)" }}>
                {f.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 8,
        background: "var(--color-bg-card)",
      }}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <MethodBadge method={ep.method} />
        <code
          style={{
            fontFamily: "monospace",
            fontSize: "0.88rem",
            color: "var(--color-text)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ep.path}
        </code>
        <AuthBadge required={ep.auth} />
        <span
          style={{
            color: "var(--color-text-muted)",
            fontSize: "0.75rem",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>

      {/* Short description always visible */}
      <div
        style={{
          padding: "0 14px 10px",
          color: "var(--color-text-muted)",
          fontSize: "0.84rem",
          lineHeight: 1.5,
        }}
      >
        {ep.description}
      </div>

      {/* Expanded details */}
      {open && (
        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            padding: "12px 14px 14px",
            background: "var(--color-bg)",
          }}
        >
          {ep.queryParams && (
            <FieldsTable fields={ep.queryParams} label="Query Parameters" />
          )}
          {ep.requestBody && (
            <FieldsTable fields={ep.requestBody} label="Request Body (JSON)" />
          )}

          {/* Response */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-muted)",
                marginBottom: 6,
              }}
            >
              Response{" "}
              <span
                style={{
                  marginLeft: 4,
                  background: "#dcfce7",
                  color: "#166534",
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontSize: "0.78rem",
                }}
              >
                {ep.response.status}
              </span>
            </div>
            <pre
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--color-text)",
                lineHeight: 1.6,
              }}
            >
              {ep.response.shape}
            </pre>
            {ep.response.note && (
              <p
                style={{
                  marginTop: 6,
                  fontSize: "0.8rem",
                  color: "var(--color-text-muted)",
                  fontStyle: "italic",
                }}
              >
                {ep.response.note}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ApiReferencePage() {
  const [filter, setFilter] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const fromProject = searchParams.get("from");

  const q = filter.toLowerCase().trim();

  const filteredGroups = API_GROUPS.map((g) => ({
    ...g,
    endpoints: g.endpoints.filter(
      (ep) =>
        !q ||
        ep.path.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q),
    ),
  })).filter((g) => g.endpoints.length > 0);

  const displayGroups = activeGroup
    ? filteredGroups.filter((g) => g.id === activeGroup)
    : filteredGroups;

  const totalEndpoints = API_GROUPS.reduce(
    (sum, g) => sum + g.endpoints.length,
    0,
  );

  const sidebarEl = fromProject ? (
    <ProjectSidebar projectId={fromProject} />
  ) : undefined;

  return (
    <Layout
      sidebar={sidebarEl}
      backTo={fromProject ? `/projects/${fromProject}` : undefined}
      backLabel="← Back to project"
    >
      <div className={fromProject ? cx.pageSidebar : cx.page}>
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "var(--color-text)",
              marginBottom: 6,
            }}
          >
            API Reference
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            {totalEndpoints} endpoints across {API_GROUPS.length} resource
            groups. Base URL:{" "}
            <code
              style={{
                fontFamily: "monospace",
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: "0.85rem",
              }}
            >
              {import.meta.env.VITE_API_URL ?? "http://localhost:4000"}
            </code>
          </p>
        </div>

        {/* Auth note */}
        <div
          style={{
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 24,
            fontSize: "0.85rem",
            color: "#5b21b6",
          }}
        >
          <strong>Authentication:</strong> All 🔒 JWT endpoints require an{" "}
          <code style={{ fontFamily: "monospace" }}>
            Authorization: Bearer &lt;token&gt;
          </code>{" "}
          header. Obtain a token from{" "}
          <code style={{ fontFamily: "monospace" }}>POST /auth/login</code> or{" "}
          <code style={{ fontFamily: "monospace" }}>POST /auth/register</code>.
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* Left sidebar — group nav */}
          <div
            style={{
              width: 180,
              flexShrink: 0,
              position: "sticky",
              top: 20,
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-muted)",
                marginBottom: 8,
              }}
            >
              Groups
            </div>
            {API_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() =>
                  setActiveGroup((prev) => (prev === g.id ? null : g.id))
                }
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  padding: "6px 8px",
                  marginBottom: 2,
                  background:
                    activeGroup === g.id
                      ? "var(--color-pill-bg)"
                      : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.85rem",
                  fontWeight: activeGroup === g.id ? 700 : 500,
                  color:
                    activeGroup === g.id
                      ? "var(--color-brand)"
                      : "var(--color-text)",
                  transition: "background 0.1s",
                }}
              >
                <span>{g.title}</span>
                <span
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    padding: "0 5px",
                    fontSize: "0.72rem",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    minWidth: 20,
                    textAlign: "center",
                  }}
                >
                  {g.endpoints.length}
                </span>
              </button>
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Search bar */}
            <div style={{ marginBottom: 20 }}>
              <input
                className={cx.fieldInput}
                type="search"
                placeholder="Filter endpoints by path, method, or description…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>

            {displayGroups.length === 0 && (
              <div className={cx.empty}>No endpoints match "{filter}".</div>
            )}

            {displayGroups.map((group) => (
              <section key={group.id} style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <h2
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: "var(--color-text)",
                      margin: 0,
                    }}
                  >
                    {group.title}
                  </h2>
                  {group.baseUrl && (
                    <code
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.78rem",
                        color: "var(--color-text-muted)",
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {group.baseUrl}
                    </code>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "0.78rem",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {group.endpoints.length} endpoint
                    {group.endpoints.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {group.endpoints.map((ep) => (
                  <EndpointCard key={ep.id} ep={ep} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
