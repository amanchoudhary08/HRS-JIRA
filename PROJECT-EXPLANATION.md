# HRS-JIRA — Taskflow Project Explanation

> A full-stack project management / task-tracking web application (JIRA-lite), built with Spring Boot (backend) and React + TypeScript (frontend).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Backend — Spring Boot](#4-backend--spring-boot)
   - [Entities & Database Schema](#41-entities--database-schema)
   - [DTOs](#42-dtos)
   - [Repositories](#43-repositories)
   - [Controllers & API Endpoints](#44-controllers--api-endpoints)
   - [Security — JWT Auth](#45-security--jwt-auth)
   - [Real-Time Events — SSE](#46-real-time-events--sse)
   - [Database Migrations — Flyway](#47-database-migrations--flyway)
   - [Application Configuration](#48-application-configuration)
   - [Dependencies](#49-dependencies)
5. [Frontend — React / TypeScript](#5-frontend--react--typescript)
   - [Type Definitions](#51-type-definitions)
   - [API Client](#52-api-client)
   - [Auth Context & Flow](#53-auth-context--flow)
   - [Pages & Routing](#54-pages--routing)
   - [Components](#55-components)
   - [Custom Hooks](#56-custom-hooks)
   - [Utilities](#57-utilities)
   - [Styling](#58-styling)
6. [Feature Map — Frontend ↔ Backend Coverage](#6-feature-map--frontend--backend-coverage)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Docker & Deployment](#8-docker--deployment)
9. [Seed Data (Test Credentials)](#9-seed-data-test-credentials)
10. [Extended Features](#10-extended-features)
    - [10.1 Story Points](#101-story-points)

---

## 1. Project Overview

**Taskflow** (branded internally as HRS-JIRA) is a lightweight project management tool modelled after JIRA. Users can:

- Register and log in with JWT-based authentication
- Create and manage **projects**
- Create, update, delete, and filter **tasks** within each project
- View tasks in a **Kanban board** (Todo / In Progress / Blocked / In Review / Done columns) with drag-and-drop
- Receive **real-time task updates** via Server-Sent Events (SSE) — no manual refresh needed
- Toggle **dark / light mode**
- Create and manage **labels** per project and apply them to tasks for categorization
- View **project statistics** (tasks by status, tasks by assignee)
- **Full-text search** tasks by title or description across all accessible projects from the nav bar
- Receive **in-app notifications** when a task is assigned to you or someone comments on your task — with a real-time bell icon, unread badge, dropdown panel, and optional hourly email digest
- Upload and download **file attachments** on any task — drag-and-drop upload, progress bar, MIME-type validation, file streaming via the API (no direct browser-to-storage access)

---

## 2. Tech Stack

| Layer              | Technology                                              |
| ------------------ | ------------------------------------------------------- |
| Backend language   | Java 17                                                 |
| Backend framework  | Spring Boot 3.5.0                                       |
| ORM                | Spring Data JPA (Hibernate)                             |
| Database           | PostgreSQL (via Docker)                                 |
| Migrations         | Flyway                                                  |
| Authentication     | JWT (JJWT 0.12.6, HMAC-SHA256)                          |
| Real-time          | Server-Sent Events (SSE)                                |
| Frontend language  | TypeScript                                              |
| Frontend framework | React 18                                                |
| Build tool         | Vite                                                    |
| Routing            | React Router v6                                         |
| Drag-and-drop      | @dnd-kit/core + @dnd-kit/sortable                       |
| Styling            | Tailwind CSS v4 + CSS custom properties (design tokens) |
| Containerization   | Docker + Docker Compose                                 |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│  React 18 + TypeScript (Vite)   port 5173 (dev)    │
│  ┌───────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ AuthPage  │  │ProjectsPage │  │ProjectDetail │  │
│  └───────────┘  └─────────────┘  └──────────────┘  │
│        │               │                │           │
│     api/client.ts  (fetch + JWT bearer token)       │
│        │               │         SSE EventSource    │
└────────┼───────────────┼────────────────┼───────────┘
         │               │                │
         ▼               ▼                ▼
┌─────────────────────────────────────────────────────┐
│           Spring Boot API  (port 4000)              │
│  ┌──────────────┐  ┌───────────────┐               │
│  │ AuthController│  │ProjectController│             │
│  └──────────────┘  └───────────────┘               │
│  ┌──────────────┐  ┌───────────────┐               │
│  │TaskController│  │ SseController │               │
│  └──────────────┘  └───────────────┘               │
│             │                 │                     │
│       JPA/Hibernate      EventBroker                │
│             │             (in-memory pub/sub)       │
└─────────────┼───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PostgreSQL  (port 5432)    │
│  tables: users, projects,   │
│          tasks, sprints,    │
│          project_members,   │
│          comments, labels,  │
│          task_labels,       │
│          activity_events,   │
│          notifications      │
└─────────────────────────────┘
```

---

## 4. Backend — Spring Boot

The backend lives in `backend/src/main/java/com/taskflow/`.

### 4.1 Entities & Database Schema

Core JPA entities map 1:1 to PostgreSQL tables.

---

#### `users` table

```sql
CREATE TABLE users (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  email      text        NOT NULL UNIQUE,
  password   text        NOT NULL,   -- bcrypt (strength 12)
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Java class:** `entity/User.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `name` | `String` | Required |
| `email` | `String` | Required, unique |
| `password` | `String` | BCrypt hash |
| `empId` | `String` | Employee ID, unique, nullable (added in V4) |
| `googleId` | `String` | Google OAuth sub, unique, nullable (added in V11) |
| `createdAt` | `OffsetDateTime` | Auto-set on insert |

---

#### `projects` table

```sql
CREATE TABLE projects (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text        NOT NULL,
  description text,
  owner_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Java class:** `entity/Project.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `name` | `String` | Required |
| `description` | `String` | Optional |
| `owner` | `User` | ManyToOne, lazy fetch |
| `createdAt` | `OffsetDateTime` | Auto-set on insert |

---

#### `tasks` table

```sql
-- Custom enum types (task_status extended by V12 to add blocked, in_review, closed)
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE tasks (
  id          uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       text          NOT NULL,
  description text,
  status      task_status   NOT NULL DEFAULT 'todo',
  priority    task_priority NOT NULL DEFAULT 'medium',
  type        text          NOT NULL DEFAULT 'task',
  project_id  uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_by  uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid          REFERENCES tasks(id) ON DELETE SET NULL,
  sprint_id   uuid          REFERENCES sprints(id) ON DELETE SET NULL,
  position    integer       NOT NULL DEFAULT 0,
  story_points integer,                        -- nullable; set via TaskModal
  due_date    date,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
```

**Java class:** `entity/Task.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `title` | `String` | Required |
| `description` | `String` | Optional |
| `status` | `TaskStatus` (enum) | todo / in_progress / blocked / in_review / done; default = todo |
| `priority` | `TaskPriority` (enum) | low / medium / high; default = medium |
| `type` | `String` | task / bug / story / epic; default = task |
| `project` | `Project` | ManyToOne, lazy |
| `assignee` | `User` | ManyToOne, lazy, nullable |
| `createdBy` | `User` | ManyToOne, lazy |
| `parent` | `Task` | Self-referencing ManyToOne, nullable (subtask parent) |
| `sprint` | `Sprint` | ManyToOne, lazy, nullable — which sprint this task belongs to |
| `position` | `int` | Display order within sprint/column; default = 0 |
| `storyPoints` | `Integer` | Nullable; integer 0–100; set per task for sprint capacity planning (added in V15) |
| `dueDate` | `LocalDate` | **Required**; must not be in the past |
| `labels` | `Set<Label>` | ManyToMany via `task_labels` join table, lazy |
| `createdAt` | `OffsetDateTime` | Auto on insert |
| `updatedAt` | `OffsetDateTime` | Auto on update |

---

#### `sprints` table

```sql
CREATE TABLE sprints (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  goal       text,
  start_date date,
  end_date   date,
  status     text        NOT NULL DEFAULT 'planning',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Java class:** `entity/Sprint.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `project` | `Project` | ManyToOne, lazy |
| `name` | `String` | Required |
| `goal` | `String` | Optional |
| `startDate` | `LocalDate` | Optional in DB; **required and ≥ today** via frontend validation |
| `endDate` | `LocalDate` | Optional in DB; **required and ≥ startDate** via frontend validation |
| `status` | `String` | `planning` / `active` / `completed`; default = `planning` |
| `createdAt` | `OffsetDateTime` | Auto on insert |

**Database indices:**

- `idx_projects_owner_id` → `projects(owner_id)`
- `idx_tasks_project_id` → `tasks(project_id)`
- `idx_tasks_assignee_id` → `tasks(assignee_id)`
- `idx_tasks_created_by` → `tasks(created_by)`
- `idx_tasks_status` → `tasks(status)`
- `idx_tasks_parent_id` → `tasks(parent_id)`

---

#### `project_members` table

```sql
CREATE TABLE project_members (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'member',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
```

**Java class:** `entity/ProjectMember.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `project` | `Project` | ManyToOne, lazy |
| `user` | `User` | ManyToOne, lazy |
| `role` | `String` | `owner` / `admin` / `member` / `viewer`; default = `member` |
| `joinedAt` | `OffsetDateTime` | Auto-set on insert |

**Roles:** `owner` is set at project creation and cannot be changed via API. `admin` can manage members and tasks. `member` can create/edit tasks. `viewer` is read-only.

**Indices:** `idx_project_members_project_id`, `idx_project_members_user_id`

---

#### `activity_events` table

```sql
CREATE TABLE activity_events (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id    uuid        REFERENCES tasks(id)    ON DELETE SET NULL,
  actor_id   uuid        REFERENCES users(id)    ON DELETE SET NULL,
  type       text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Java class:** `entity/ActivityEvent.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `project` | `Project` | ManyToOne, lazy — which project this event belongs to |
| `task` | `Task` | ManyToOne, lazy, nullable — specific task if event is task-scoped |
| `actor` | `User` | ManyToOne, lazy — the user who performed the action |
| `type` | `String` | Event type string (see event types below) |
| `payload` | `Map<String,Object>` | JSONB — arbitrary key/value context for the event |
| `createdAt` | `OffsetDateTime` | Auto-set on insert |

---

#### `comments` table

```sql
CREATE TABLE comments (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    uuid        NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Java class:** `entity/Comment.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `task` | `Task` | ManyToOne, lazy |
| `author` | `User` | ManyToOne, lazy |
| `body` | `String` | Required |
| `createdAt` | `OffsetDateTime` | Auto on insert |
| `updatedAt` | `OffsetDateTime` | Auto on update |

**Index:** `idx_comments_task_id`

---

#### `labels` and `task_labels` tables

```sql
CREATE TABLE labels (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE task_labels (
  task_id  uuid NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
```

**Java class:** `entity/Label.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `project` | `Project` | ManyToOne, lazy |
| `name` | `String` | Required |
| `color` | `String` | Hex color string; default `#6366f1` |

**Indices:** `idx_labels_project_id`, `idx_task_labels_task_id`, `idx_task_labels_label_id`

---

#### `notifications` table

```sql
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
```

**Java class:** `entity/Notification.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `user` | `User` | ManyToOne, lazy — the recipient |
| `type` | `String` | `task_assigned` or `comment_added` |
| `payload` | `Map<String,Object>` | JSONB — e.g. `{ taskId, taskTitle, projectId, assignedBy }` |
| `read` | `boolean` | Starts `false`; flipped to `true` when user reads it |
| `createdAt` | `OffsetDateTime` | Auto-set on insert |

**Index:** `idx_notifications_user_id`

---

#### `attachments` table

```sql
CREATE TABLE attachments (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      uuid        NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  uploaded_by  uuid        NOT NULL REFERENCES users(id),
  filename     text        NOT NULL,
  mime_type    text        NOT NULL,
  size_bytes   bigint      NOT NULL,
  storage_key  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_task_id ON attachments(task_id);
```

**Java class:** `entity/Attachment.java`
| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Auto-generated UUID |
| `task` | `Task` | ManyToOne, lazy — the task this attachment belongs to |
| `uploadedBy` | `User` | ManyToOne, lazy — the user who uploaded the file |
| `filename` | `String` | Original filename from the upload |
| `mimeType` | `String` | MIME type (e.g. `image/png`, `application/pdf`) |
| `sizeBytes` | `long` | File size in bytes |
| `storageKey` | `String` | Internal object storage key — never exposed to clients |
| `createdAt` | `OffsetDateTime` | Auto-set on insert |

**Index:** `idx_attachments_task_id`

---

### 4.2 DTOs

Data Transfer Objects define what the API returns (never raw entities).

| DTO                | Fields                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserDto`          | `id`, `name`, `email`                                                                                                                                                                                                                                  |
| `ProjectDto`       | `id`, `name`, `description`, `ownerId`, `createdAt`, `members` (optional — omitted when null)                                                                                                                                                          |
| `ProjectMemberDto` | `projectId`, `userId`, `userName`, `userEmail`, `role`, `joinedAt`                                                                                                                                                                                     |
| `TaskDto`          | `id`, `title`, `description`, `status`, `priority`, `type`, `projectId`, `assigneeId`, `createdBy`, `parentId`, `sprintId`, `position`, `storyPoints`, `dueDate`, `createdAt`, `updatedAt`, `labels` (`List<LabelDto>`, sorted alphabetically by name) |
| `LabelDto`         | `id`, `projectId`, `name`, `color`                                                                                                                                                                                                                     |
| `CommentDto`       | `id`, `taskId`, `projectId`, `authorId`, `authorName`, `body`, `createdAt`, `updatedAt`                                                                                                                                                                |
| `SprintDto`        | `id`, `projectId`, `name`, `goal`, `startDate`, `endDate`, `status`, `createdAt`                                                                                                                                                                       |
| `ActivityEventDto` | `id`, `projectId`, `taskId`, `actorId`, `actorName`, `type`, `payload` (`Map<String,Object>`), `createdAt` — built from in-memory values (no lazy re-fetch) to avoid `LazyInitializationException`                                                     |
| `SearchResultDto`  | `projectId`, `projectName`, `tasks` (`List<TaskDto>`) — one entry per project in the global search response                                                                                                                                            |
| `NotificationDto`  | `id`, `userId`, `type`, `payload` (`Map<String,Object>`), `read`, `createdAt`                                                                                                                                                                          |
| `AttachmentDto`    | `id`, `taskId`, `uploadedById`, `uploadedByName`, `filename`, `mimeType`, `sizeBytes`, `createdAt` — `url` field is omitted (downloads proxied through the API, not presigned URLs)                                                                    |

All are Java `record` types (immutable). `ProjectDto` exposes two factories: `from(Project)` (no members) and `withMembers(Project, List<ProjectMemberDto>)` (includes members).

---

### 4.3 Repositories

Spring Data JPA repositories with custom JPQL queries.

#### `UserRepository`

- `findByEmail(String email): Optional<User>` — Used during login

#### `ProjectRepository`

- `findAccessibleByUser(User, Pageable)` — Returns projects where user is the owner, is assigned to at least one task, **or** has a row in `project_members`
- `existsAccessibleByUserAndId(UUID userId, UUID projectId)` — Authorization check (same three-way condition)
- `existsByIdAndOwnerId(UUID id, UUID ownerId)` — Owner-only action guard

#### `ProjectMemberRepository`

- `findByProjectIdWithUser(UUID projectId)` — All members for a project with user eagerly fetched, ordered by `joinedAt`
- `findByProjectIdAndUserId(UUID projectId, UUID userId)` — Single membership lookup
- `existsByProjectAndUser(Project, User)` — Duplicate-invite guard
- `findByProjectIdIn(List<UUID> projectIds)` — Batch-fetch members for multiple projects (used in list endpoint)

#### `TaskRepository`

- `findByProjectId(UUID, Pageable)` — All tasks in a project (paginated)
- `findByProjectIdAndStatus(UUID, TaskStatus, Pageable)` — Filter by status
- `findByProjectIdAndAssigneeId(UUID, UUID, Pageable)` — Filter by assignee
- `findByProjectIdAndStatusAndAssigneeId(UUID, TaskStatus, UUID, Pageable)` — Filter by both
- `findTop1000ByProjectIdOrderByCreatedAtDesc(UUID)` — For detail page full list
- `countByStatusForProject(UUID)` — Stats: group by status
- `countByAssigneeForProject(UUID)` — Stats: group by assignee (with names)
- `findByIdAndProjectId(UUID taskId, UUID projectId)` — Safe task lookup within project
- `findByProjectIdAndParentId(UUID projectId, UUID parentId)` — All direct subtasks of a task
- `countByTypeForProject(UUID)` — Stats: count per task type (task/bug/story/epic)
- `countBySprintForProject(UUID)` — Stats: count per sprint name (null sprint → "Backlog"); top-level tasks only
- `countDonePerDaySince(UUID projectId, LocalDate since)` — Native query: count tasks closed (status=done) per day since a given date; used for 14-day burndown
- `countOverdueForProject(UUID projectId, LocalDate today)` — Count tasks where `due_date < today` and `status != done`
- `searchInProject(UUID projectId, String q, Pageable)` — Case-insensitive LIKE search on `title` + `description` within one project; returns up to 20 results ordered by `updatedAt DESC`
- `searchAcrossProjects(List<UUID> projectIds, String q, Pageable)` — Same LIKE search across multiple project IDs; returns up to 50 results ordered by `updatedAt DESC`
- `findWithLabelsByIdIn(List<UUID> ids)` — JOIN FETCH `labels` for a batch of task IDs; used by `LabelController` before attach/detach to avoid `LazyInitializationException` on the `ManyToMany` collection

#### `ActivityEventRepository`

- `findByProjectIdOrderByCreatedAtDesc(UUID projectId, Pageable)` — Project-level activity feed, newest-first; JOIN FETCH actor
- `findByTaskIdOrderByCreatedAtDesc(UUID taskId)` — Task-scoped activity feed; JOIN FETCH actor

#### `CommentRepository`

- `findByTaskIdOrderByCreatedAtAsc(UUID taskId)` — All comments for a task, oldest-first; JOIN FETCH `task → project` and `author`
- `findByIdWithDetails(UUID id)` — Single comment with all associations eagerly loaded; used after `PATCH` to safely build `CommentDto`

#### `SprintRepository`

- `findByProjectIdOrderByCreatedAtAsc(UUID projectId)` — All sprints for a project in creation order
- `findByIdAndProjectId(UUID id, UUID projectId)` — Safe sprint lookup scoped to a project

#### `LabelRepository`

- `findByProjectIdOrderByName(UUID projectId)` — All labels for a project, sorted alphabetically
- `findByIdAndProjectId(UUID id, UUID projectId)` — Safe label lookup scoped to a project
- `existsByProjectIdAndName(UUID projectId, String name)` — Duplicate-name guard before creating a label

#### `NotificationRepository`

- `findByUserIdOrderByReadAscCreatedAtDesc(UUID userId, Pageable)` — Paginated list for the current user; unread first
- `countByUserIdAndReadFalse(UUID userId)` — Unread badge count
- `markAllReadForUser(UUID userId)` — Bulk `UPDATE` via `@Modifying @Query`
- `findUnreadByUserId(UUID userId)` — All unread rows; used by hourly email digest

#### `AttachmentRepository`

- `findByTaskIdOrderByCreatedAtAsc(UUID taskId)` — All attachments for a task, oldest-first; JOIN FETCH `uploadedBy`
- `findByIdAndTaskId(UUID id, UUID taskId)` — Safe attachment lookup scoped to a task; JOIN FETCH `uploadedBy`

---

### 4.4 Controllers & API Endpoints

Base URL: `http://localhost:4000`

---

#### `AuthController` — `/auth`

| Method | Path             | Auth     | Request Body                | Response                   |
| ------ | ---------------- | -------- | --------------------------- | -------------------------- |
| `POST` | `/auth/register` | Public   | `{ name, email, password }` | `201 { token, user }`      |
| `POST` | `/auth/login`    | Public   | `{ email, password }`       | `200 { token, user }`      |
| `GET`  | `/users`         | Required | —                           | `200 { users: UserDto[] }` |

- Passwords are BCrypt-hashed (strength 12) before storage
- JWT token is returned immediately on register and login
- `GET /users` returns all users sorted alphabetically (used for assignee dropdown)

---

#### `ProjectController` — `/projects`

| Method   | Path                   | Auth       | Request/Params            | Response                                                                                 |
| -------- | ---------------------- | ---------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/projects`            | Required   | `?page=1&limit=20`        | `200 { projects[], page, limit, total }` (each project includes `members[]`)             |
| `POST`   | `/projects`            | Required   | `{ name, description? }`  | `201 ProjectDto` (also seeds owner into `project_members`)                               |
| `GET`    | `/projects/{id}`       | Required   | —                         | `200 { ...ProjectDto, tasks[], members[] }`                                              |
| `PATCH`  | `/projects/{id}`       | Owner only | `{ name?, description? }` | `200 ProjectDto`                                                                         |
| `DELETE` | `/projects/{id}`       | Owner only | —                         | `204 No Content`                                                                         |
| `GET`    | `/projects/{id}/stats` | Required   | —                         | `200 { total, overdue, by_status, by_assignee[], by_type[], by_sprint[], daily_done[] }` |

**Authorization rules:**

- `GET /projects` — Shows projects where the user is the owner, an assigned task member, or has a `project_members` row
- `PATCH` / `DELETE` — Restricted to the project owner only

---

#### `ProjectMemberController` — `/projects/{projectId}/members`

| Method   | Path                              | Auth          | Request Body       | Response                              |
| -------- | --------------------------------- | ------------- | ------------------ | ------------------------------------- |
| `GET`    | `/projects/{id}/members`          | Required      | —                  | `200 { members: ProjectMemberDto[] }` |
| `POST`   | `/projects/{id}/members`          | Owner / Admin | `{ email, role? }` | `201 ProjectMemberDto`                |
| `PATCH`  | `/projects/{id}/members/{userId}` | Owner only    | `{ role }`         | `200 ProjectMemberDto`                |
| `DELETE` | `/projects/{id}/members/{userId}` | Owner / Admin | —                  | `204 No Content`                      |

**Authorization rules:**

- `GET` — Any user with access to the project
- `POST` / `DELETE` — Project owner or admin-role member
- `PATCH` (role change) — Project owner only
- Cannot assign or remove the `owner` role via API
- Cannot remove the project owner member row

---

#### `TaskController` — `/projects/{projectId}/tasks`

| Method   | Path                                     | Auth                   | Request/Params                                                                                     | Response                              |
| -------- | ---------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `GET`    | `/projects/{id}/tasks`                   | Required               | `?status=&assignee=&page=1&limit=20`                                                               | `200 { tasks[], page, limit, total }` |
| `POST`   | `/projects/{id}/tasks`                   | Required               | `{ title, description?, status?, priority?, type?, parentId?, assigneeId?, sprintId?, dueDate }`   | `201 TaskDto`                         |
| `PATCH`  | `/projects/{id}/tasks/{taskId}`          | Owner/creator/assignee | `{ title?, description?, status?, priority?, type?, parentId?, assigneeId?, sprintId?, dueDate? }` | `200 TaskDto`                         |
| `DELETE` | `/projects/{id}/tasks/{taskId}`          | Owner or creator       | —                                                                                                  | `204 No Content`                      |
| `GET`    | `/projects/{id}/tasks/{taskId}/subtasks` | Required               | —                                                                                                  | `200 { subtasks: TaskDto[] }`         |
| `PATCH`  | `/projects/{id}/tasks/{taskId}/position` | Required               | `{ status?, position?, sprintId? }`                                                                | `200 TaskDto`                         |

**Validation:**

- `title` — Required on creation
- `status` — One of: `todo`, `in_progress`, `blocked`, `in_review`, `done`
- `priority` — One of: `low`, `medium`, `high`
- `type` — One of: `task`, `bug`, `story`, `epic`; defaults to `task`
- `parentId` — Must reference a task in the same project that is itself not a subtask (max 1 level of nesting)
- `dueDate` — ISO format `YYYY-MM-DD`; **required on creation**; must not be before today
- `assigneeId` — Valid UUID referencing an existing user
- `sprintId` — Optional UUID referencing a sprint in the same project

**SSE side effects:** Every `POST`, `PATCH`, and `DELETE` on a task triggers:

1. An SSE broadcast (`task_created`, `task_updated`, `task_deleted`, or `task_moved`) to all clients subscribed to that project
2. One or more `activity_created` SSE events describing exactly what changed (see activity event types below)

**Activity events emitted by `TaskController`:**
| Activity event type | When triggered | Payload fields |
|---|---|---|
| `task_created` | New task saved | `title`, `type` |
| `subtask_created` | New task saved with a `parentId` — logged against the **parent** task | `title`, `type` |
| `title_changed` | Title was modified | `title`, `from`, `to` |
| `status_changed` | Status was modified | `title`, `from`, `to` |
| `priority_changed` | Priority was modified | `title`, `from`, `to` |
| `type_changed` | Type was modified | `title`, `from`, `to` |
| `assignee_changed` | Assignee added, changed, or removed | `title`, `from`, `to` |
| `due_date_changed` | Due date added, changed, or removed | `title`, `from`, `to` |
| `sprint_changed` | Sprint assignment added, changed, or removed | `title`, `from`, `to` |
| `task_deleted` | Task deleted | `title` |
| `label_added` | Label attached to task (via `LabelController`) | `title`, `label` |
| `label_removed` | Label detached from task (via `LabelController`) | `title`, `label` |

> **Lazy-loading fix:** Old `assignee`/`sprint` values are captured using proxy IDs (`task.getAssignee().getId()`) and then looked up via `userRepo`/`sprintRepo` **before** `taskRepo.save()` mutates the entity. New values are looked up the same way **after** `save()`. This avoids `LazyInitializationException` caused by `open-in-view: false` in `application.yml`.

---

#### `SprintController` — `/projects/{projectId}/sprints`

| Method   | Path                                               | Auth          | Request Body                                     | Response                        |
| -------- | -------------------------------------------------- | ------------- | ------------------------------------------------ | ------------------------------- |
| `GET`    | `/projects/{id}/sprints`                           | Required      | —                                                | `200 { sprints: SprintDto[] }`  |
| `POST`   | `/projects/{id}/sprints`                           | Owner / Admin | `{ name, goal?, startDate, endDate }`            | `201 SprintDto`                 |
| `PATCH`  | `/projects/{id}/sprints/{sprintId}`                | Owner / Admin | `{ name?, goal?, startDate?, endDate?, status?}` | `200 SprintDto`                 |
| `DELETE` | `/projects/{id}/sprints/{sprintId}`                | Owner / Admin | —                                                | `204 No Content`                |
| `POST`   | `/projects/{id}/sprints/{sprintId}/tasks/{taskId}` | Owner / Admin | —                                                | `200 TaskDto` (task assigned)   |
| `DELETE` | `/projects/{id}/sprints/{sprintId}/tasks/{taskId}` | Owner / Admin | —                                                | `200 TaskDto` (task unassigned) |

**Status transitions:**

- `planning` → `active` (start sprint): only one sprint may be active per project at a time
- `active` → `completed` (complete sprint)

**SSE side effects:** `PATCH` with `status: active` publishes `sprint_started`; `status: completed` publishes `sprint_completed`; task assignment/unassignment publishes `task_moved`.

---

#### `CommentController` — `/projects/{projectId}/tasks/{taskId}/comments`

| Method   | Path                                                 | Auth           | Request Body | Response                         |
| -------- | ---------------------------------------------------- | -------------- | ------------ | -------------------------------- |
| `GET`    | `/projects/{id}/tasks/{taskId}/comments`             | Required       | —            | `200 { comments: CommentDto[] }` |
| `POST`   | `/projects/{id}/tasks/{taskId}/comments`             | Required       | `{ body }`   | `201 CommentDto`                 |
| `PATCH`  | `/projects/{id}/tasks/{taskId}/comments/{commentId}` | Author only    | `{ body }`   | `200 CommentDto`                 |
| `DELETE` | `/projects/{id}/tasks/{taskId}/comments/{commentId}` | Author / Owner | —            | `204 No Content`                 |

**SSE side effects:** `POST` publishes `comment_added`; `DELETE` publishes `comment_deleted`.

> **Bug fix:** `PATCH` re-fetches the saved entity via `findByIdWithDetails` after `save()` to eagerly load `task → project` and `author` associations before passing to `CommentDto.from()`, preventing a lazy-loading 500 error.

---

#### `SseController` — `/projects/{projectId}/events`

| Method | Path                              | Auth                 | Notes                       |
| ------ | --------------------------------- | -------------------- | --------------------------- |
| `GET`  | `/projects/{id}/events?token=JWT` | Token in query param | Returns `text/event-stream` |

- Token is passed as a query parameter because the browser's `EventSource` API cannot set custom headers
- Sends an initial "connected" comment immediately
- Streams live events: `task_created`, `task_updated`, `task_deleted`
- Emitter has no timeout (long-lived connection)

---

#### `ActivityController` — `/projects/{projectId}/activity`

| Method | Path                                     | Auth     | Params      | Response                               |
| ------ | ---------------------------------------- | -------- | ----------- | -------------------------------------- |
| `GET`  | `/projects/{id}/activity`                | Required | `?limit=50` | `200 { activity: ActivityEventDto[] }` |
| `GET`  | `/projects/{id}/tasks/{taskId}/activity` | Required | —           | `200 { activity: ActivityEventDto[] }` |

Events are ordered newest-first. The project feed shows all events across the project; the task feed shows only events for a specific task.

---

#### `HealthController`

| Method | Path       | Auth   |
| ------ | ---------- | ------ |
| `GET`  | `/healthz` | Public |

Returns `200 { status: "ok" }` — used by Docker healthchecks.

---

#### `SearchController`

| Method | Path                             | Auth     | Params    | Response                             |
| ------ | -------------------------------- | -------- | --------- | ------------------------------------ |
| `GET`  | `/projects/{id}/tasks/search?q=` | Required | `q` (str) | `200 { tasks: TaskDto[] }`           |
| `GET`  | `/search?q=`                     | Required | `q` (str) | `200 { results: SearchResultDto[] }` |

**`GET /projects/{id}/tasks/search?q=`** — searches within a single project.

- Returns up to 20 matching tasks.
- Requires `q` of at least 2 characters; returns empty list otherwise.

**`GET /search?q=`** — global search across all projects accessible to the current user.

- Fetches all accessible projects (up to 100), then queries tasks via JPQL LIKE on `title` + `description`.
- Returns results grouped by project (each group: `project_id`, `project_name`, `tasks[]`), sorted alphabetically by project name.
- Returns up to 50 tasks total across all projects.
- Requires `q` of at least 2 characters; returns empty list otherwise.

---

#### `LabelController` — `/projects/{projectId}/labels`

| Method   | Path                                             | Auth     | Request Body        | Response                            |
| -------- | ------------------------------------------------ | -------- | ------------------- | ----------------------------------- |
| `GET`    | `/projects/{id}/labels`                          | Required | —                   | `200 { labels: LabelDto[] }`        |
| `POST`   | `/projects/{id}/labels`                          | Required | `{ name, color? }`  | `201 LabelDto`                      |
| `PATCH`  | `/projects/{id}/labels/{labelId}`                | Required | `{ name?, color? }` | `200 LabelDto`                      |
| `DELETE` | `/projects/{id}/labels/{labelId}`                | Required | —                   | `204 No Content`                    |
| `POST`   | `/projects/{id}/tasks/{taskId}/labels/{labelId}` | Required | —                   | `200 TaskDto` (with updated labels) |
| `DELETE` | `/projects/{id}/tasks/{taskId}/labels/{labelId}` | Required | —                   | `200 TaskDto` (with updated labels) |

**Validation:**

- `name` — Required; must be unique per project (case-sensitive)
- `color` — Optional; must match `#[0-9a-fA-F]{3,6}`; defaults to `#6366f1`

**SSE side effects:** Label attach/detach broadcasts `task_updated` with the full updated `TaskDto` (including new label list). Also logs `label_added` / `label_removed` activity events.

**Lazy-loading note:** Before modifying the `ManyToMany` labels collection, the task is re-fetched via `taskRepo.findWithLabelsByIdIn()` to eagerly load labels and avoid `LazyInitializationException`.

---

#### `NotificationController` — `/notifications`

| Method  | Path                       | Auth     | Params             | Response                                      |
| ------- | -------------------------- | -------- | ------------------ | --------------------------------------------- |
| `GET`   | `/notifications`           | Required | `?page=1&limit=20` | `200 { notifications[], page, limit, total }` |
| `GET`   | `/notifications/count`     | Required | —                  | `200 { unread: N }`                           |
| `PATCH` | `/notifications/{id}/read` | Required | —                  | `200 NotificationDto`                         |
| `PATCH` | `/notifications/read-all`  | Required | —                  | `200 { ok: true }`                            |

All endpoints are scoped to the authenticated user — users can never read or modify another user's notifications.

---

#### `AttachmentController` — `/projects/{projectId}/tasks/{taskId}/attachments`

| Method   | Path                                                                | Auth           | Request                            | Response                               |
| -------- | ------------------------------------------------------------------- | -------------- | ---------------------------------- | -------------------------------------- |
| `GET`    | `/projects/{id}/tasks/{taskId}/attachments`                         | Required       | —                                  | `200 { attachments: AttachmentDto[] }` |
| `GET`    | `/projects/{id}/tasks/{taskId}/attachments/{attachmentId}/download` | Required       | —                                  | `200 (binary stream)`                  |
| `POST`   | `/projects/{id}/tasks/{taskId}/attachments`                         | Required       | `multipart/form-data` field `file` | `201 AttachmentDto`                    |
| `DELETE` | `/projects/{id}/tasks/{taskId}/attachments/{attachmentId}`          | Uploader/Owner | —                                  | `204 No Content`                       |

**Upload validation:**

- Max file size: **50 MB** (enforced by `AttachmentService` before storing, plus `spring.servlet.multipart.max-file-size`)
- MIME type allowlist: `image/*`, `application/pdf`, `text/*`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`

**Download strategy:**

- The API streams the file from MinIO object storage internally using `StreamingResponseBody`
- The browser never talks to MinIO directly — JWT authorization is enforced on every download
- Responds with correct `Content-Type`, `Content-Disposition: inline; filename="…"`, and `Content-Length` headers

**Authorization rules:**

- `GET` (list + download) — Any project member
- `DELETE` — Only the uploader or the project owner

**Object storage:**

- Files stored in MinIO under the bucket configured by `app.minio.bucket`
- Storage key format: `{UUID}/{original-filename}` (UUID generated per upload)
- `AttachmentService` wraps `MinioClient` — handles bucket creation on startup, upload (`putObject`), stream (`getObject`), delete (`removeObject`)

---

#### `NotificationSseController` — `/notifications/events`

| Method | Path                    | Auth     | Notes                       |
| ------ | ----------------------- | -------- | --------------------------- |
| `GET`  | `/notifications/events` | Required | Returns `text/event-stream` |

- Opens a **personal** SSE channel for the authenticated user (keyed by `userId`, not `projectId`)
- Uses `broker.subscribeUser(user.getId())` from `EventBroker`
- Sends an initial ping comment immediately
- Emits `notification` events whenever `NotificationService.notify()` is called for that user

---

#### `GlobalExceptionHandler` — `@RestControllerAdvice`

Applied globally across all controllers:

- **`MethodArgumentNotValidException`** → `400 { error: "validation failed", fields: { fieldName: message } }` — fired when `@Valid` bean validation fails
- **All other `Exception`** → `500 { error: "internal server error" }`
- **SSE safety:** If the request `Accept` header contains `text/event-stream`, the handler returns `null` to avoid triggering a response-converter error on the long-lived SSE connection

---

### 4.5 Security — JWT Auth

**`JwtUtil`**

- Algorithm: HMAC-SHA256
- Secret: 32-byte key derived from `JWT_SECRET` environment variable
- Expiry: 24 hours
- Claims stored in token: `user_id`, `email`, `name`, `iat`, `exp`

**`JwtAuthFilter`** (extends `OncePerRequestFilter`)

- Reads the `Authorization: Bearer <token>` header
- Validates signature and expiry
- Loads the `User` from the database
- Sets `UsernamePasswordAuthenticationToken` into `SecurityContextHolder`
- Silent on invalid/missing tokens (downstream endpoint decides if auth is required)

**`SecurityConfig`**

- CSRF disabled (stateless REST API)
- CORS: allows all origins, methods `GET/POST/PATCH/DELETE/OPTIONS`, headers `Authorization` and `Content-Type`
- Session management: `IF_REQUIRED` (required for OAuth2 state cookie handshake)
- Public routes: `POST /auth/register`, `POST /auth/login`, `OPTIONS /**`, `GET /healthz`, `/oauth2/**`, `/login/oauth2/**`
- All other routes require a valid JWT

---

### 4.5.1 Google OAuth2 — Sign in with Google

Users can sign in using their Google account. The flow bridges Spring Security's OAuth2 client with the existing JWT system.

**Backend components:**

**`OAuth2SuccessHandler`** (`security/OAuth2SuccessHandler.java`) — `AuthenticationSuccessHandler`

- Triggered after Google redirects back with a valid OAuth2 token
- Reads `email`, `name`, `sub` (Google ID) from the `OAuth2User` principal
- Upsert logic:
  1. Find user by `google_id` → already linked, use directly
  2. Find user by `email` → existing email/password account; links `google_id` and saves
  3. Neither found → creates a new `User` with a random unusable password and the Google ID
- Generates a standard JWT via `JwtUtil.generateToken(user)`
- Redirects to `{FRONTEND_URL}/oauth2/callback?token=JWT`

**`User` entity** — added `google_id text UNIQUE` column (migration `V11__google_oauth.sql`)

**`UserRepository`** — added `findByGoogleId(String googleId)`

**`application.yml`** additions:

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope: openid, email, profile
        provider:
          google:
            authorization-uri: https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account
app:
  frontend-url: ${FRONTEND_URL:http://localhost:3000}
```

**Frontend components:**

**`OAuth2CallbackPage`** (`pages/OAuth2CallbackPage.tsx`)

- Mounted at `/oauth2/callback`
- Reads `?token=` from the URL
- Decodes the JWT payload (base64) to extract `user_id`, `name`, `email`
- Calls `loginWithToken(token, user)` from `AuthContext` → stores in `localStorage` + React state
- Navigates to `/projects`

**`AuthPage`** — "Continue with Google" button added below the regular login form

- Renders an `<a>` tag pointing to `{VITE_API_URL}/oauth2/authorization/google`
- Navigating to that URL starts the Spring Security OAuth2 flow
- Google's logo SVG is inlined
- A styled divider ("or") separates it from the email/password form

**`AuthContext`** — added `loginWithToken(token, user)` method for the callback page to use

**`AuthContextValue` type** — updated to include `loginWithToken`

**Environment variables required:**

| Variable               | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | From Google Cloud Console → OAuth 2.0 Credentials                      |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console → OAuth 2.0 Credentials                      |
| `FRONTEND_URL`         | Where backend redirects after OAuth (default: `http://localhost:3000`) |

**Google Cloud Console setup:**

- Authorized redirect URI must be: `http://localhost:4000/login/oauth2/code/google`
- OAuth consent screen must be configured (External audience for dev)

---

### 4.6 Real-Time Events — SSE

**`SseEvent`** — Java record: `(String type, Object data)`

**`EventBroker`** — Spring `@Component` singleton

- Maintains two maps:
  - `emitters: ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>>` — project-scoped (for task/sprint/comment events)
  - `userEmitters: ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>>` — user-scoped (personal notification channel)
- `subscribe(UUID projectId)` — Creates a project-scoped `SseEmitter`, registers it, sets up cleanup callbacks
- `subscribeUser(UUID userId)` — Creates a user-scoped `SseEmitter` on the personal channel
- `publish(UUID projectId, SseEvent event)` — Broadcasts to all emitters for the project
- `publishToUser(UUID userId, SseEvent event)` — Pushes to a specific user's personal emitters only
- Thread-safe; stale emitters are auto-removed on error

**Event types and payloads:**
| Event | Trigger | Payload |
|---|---|---|
| `task_created` | `POST /tasks` | Full `TaskDto` |
| `task_updated` | `PATCH /tasks/{id}` | Full `TaskDto` |
| `task_deleted` | `DELETE /tasks/{id}` | `{ id, project_id }` |
| `task_moved` | `PATCH /tasks/{id}/position` or sprint task assignment | Full `TaskDto` |
| `sprint_started` | `PATCH /sprints/{id}` with `status: active` | Full `SprintDto` |
| `sprint_completed` | `PATCH /sprints/{id}` with `status: completed` | Full `SprintDto` |
| `comment_added` | `POST /comments` | Full `CommentDto` |
| `comment_updated` | `PATCH /comments/{id}` | Full `CommentDto` |
| `comment_deleted` | `DELETE /comments/{id}` | `{ id, task_id }` |
| `activity_created` | Any mutating operation in any controller | Full `ActivityEventDto` |
| `member_added` | `POST /members` | `{ userName, role }` |
| `member_removed` | `DELETE /members/{userId}` | `{ userName }` |
| `role_changed` | `PATCH /members/{userId}` | `{ userName, role }` |
| `notification` | Task assigned or comment added (personal channel only) | Full `NotificationDto` |

**`NotificationService`** (`service/NotificationService.java`)

Centralised service injected into `TaskController` and `CommentController`:

```java
notificationService.notify(userId, type, payload);
// payload builder helper:
NotificationService.payload("taskId", id, "taskTitle", "Fix login bug", "assignedBy", "Alice");
```

- Saves a `Notification` row to the DB
- Calls `broker.publishToUser(userId, SseEvent("notification", NotificationDto))` immediately

**When notifications are triggered:**

- `TaskController` — on task create/update: if a task is assigned to someone who is not the actor
- `CommentController` — on comment create: if the task creator is not the commenter

**`EmailService`** (`service/EmailService.java`)

- `@Scheduled(fixedDelay = 3_600_000)` — runs every hour
- Only active when `MAIL_ENABLED=true` in environment
- For each user with unread notifications, sends a plain-text digest email via `JavaMailSender`
- Mail failure is caught and logged — never breaks the HTTP response
- Controlled via `app.mail.enabled` and `spring.mail.*` config in `application.yml`

---

**`ActivityService`** (`service/ActivityService.java`)

Centralised service injected into all mutating controllers:

```java
activityService.log(projectId, taskId, actorId, type, payload);
// or without payload:
activityService.log(projectId, taskId, actorId, type);
// payload builder helper:
ActivityService.payload("title", "task1", "from", "todo", "to", "in_progress");
```

- Saves an `ActivityEvent` row to the DB
- Builds `ActivityEventDto` from in-memory values (never re-fetches — avoids lazy-loading errors)
- Broadcasts `activity_created` SSE to all project subscribers

---

### 4.7 Database Migrations — Flyway

Migrations live in `backend/src/main/resources/db/migration/`.

**V1\_\_create_schema.sql**

- Enables `uuid-ossp` PostgreSQL extension
- Creates enum types `task_status`, `task_priority`
- Creates `users`, `projects`, `tasks` tables
- Creates 5 performance indices

**V2\_\_seed_data.sql**

- Inserts 2 demo users (bcrypt-hashed password `password123`):
  - `test@example.com` — "Test User"
  - `alex@example.com` — "Alex Johnson"
- Inserts 1 demo project: "Website Redesign" (owned by Test User)
- Inserts 3 demo tasks:
  - "Design homepage" — in_progress, high priority, assigned to Test User, due in 5 days
  - "Write API contract" — todo, medium priority, assigned to Alex, due in 8 days
  - "Prepare review notes" — done, low priority, unassigned

**V3\_\_project_members.sql**

- Creates the `project_members` table with `UNIQUE (project_id, user_id)` constraint
- Adds indices `idx_project_members_project_id` and `idx_project_members_user_id`
- Seeds all existing projects' owners into the table with role `owner`

**V4\_\_emp_id.sql**

- Adds `emp_id VARCHAR(20) UNIQUE` column to `users`
- Sets `emp_id` for the two original seed users: `test@example.com` → `test`, `alex@example.com` → `are01`
- Inserts 3 additional corporate users (all with password `password123`):
  - Aman Choudhary (`ach51`) — `aman.choudhary@hrs.com`
  - Gaganajeet Singh (`gsi50`) — `gaganajeet.singh@hrs.com`
  - Umang Yadav (`uya01`) — `umang.yadav@hrs.com`

**V5\_\_comments.sql**

- Creates the `comments` table (task comments with author, body, timestamps)
- Adds index `idx_comments_task_id`

**V6\_\_task_types.sql**

- Adds `type text NOT NULL DEFAULT 'task'` column to `tasks` — values: `task`, `bug`, `story`, `epic`
- Adds `parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL` — self-referencing FK for subtask hierarchy (max 1 level)
- Adds index `idx_tasks_parent_id`

**V7\_\_sprints.sql**

- Creates the `sprints` table:
  ```sql
  CREATE TABLE sprints (
    id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       text        NOT NULL,
    goal       text,
    start_date date,
    end_date   date,
    status     text        NOT NULL DEFAULT 'planning',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- Adds `sprint_id uuid REFERENCES sprints(id) ON DELETE SET NULL` column to `tasks`
- Adds `position integer NOT NULL DEFAULT 0` column to `tasks` (for ordering within a sprint/column)
- Adds index `idx_sprints_project_id`, `idx_tasks_sprint_id`

**V8\_\_activity_log.sql**

- Creates the `activity_events` table:
  ```sql
  CREATE TABLE activity_events (
    id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id    uuid        REFERENCES tasks(id)    ON DELETE SET NULL,
    actor_id   uuid        REFERENCES users(id)    ON DELETE SET NULL,
    type       text        NOT NULL,
    payload    jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- Adds indices `idx_activity_project_id` and `idx_activity_task_id`

**V9\_\_search_vector.sql**

- Adds a generated, stored `tsvector` column to `tasks` for fast full-text search:
  ```sql
  ALTER TABLE tasks ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) STORED;
  ```
- Creates a `GIN` index `idx_tasks_search` on the column for high-performance text queries
- The column is updated automatically by PostgreSQL whenever `title` or `description` changes — no application-side maintenance needed

**V10\_\_labels.sql**

- Creates the `labels` table: `id`, `project_id` (FK → `projects`), `name`, `color` (default `#6366f1`)
- Creates the `task_labels` join table: composite PK `(task_id, label_id)`, both FKs with `ON DELETE CASCADE`
- Adds indices `idx_labels_project_id`, `idx_task_labels_task_id`, `idx_task_labels_label_id`

**V11\_\_google_oauth.sql**

- Adds `google_id text UNIQUE` column to `users` — stores the Google OAuth `sub` claim for OAuth-authenticated accounts

**V12\_\_add_task_statuses.sql**

- Extends the `task_status` PostgreSQL enum with three new values:
  - `blocked` — task is blocked by a dependency or issue
  - `in_review` — task is under review / awaiting approval
  - `closed` — task closed without completion (defined in DB; not currently exposed in the frontend UI)

**V13\_\_notifications.sql**

- Creates the `notifications` table: `id`, `user_id` (FK → `users`), `type`, `payload` (jsonb), `read` (boolean, default false), `created_at`
- Adds index `idx_notifications_user_id`

**V14\_\_attachments.sql**

- Creates the `attachments` table:
  ```sql
  CREATE TABLE attachments (
    id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id     uuid        NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
    uploaded_by uuid        NOT NULL REFERENCES users(id),
    filename    text        NOT NULL,
    mime_type   text        NOT NULL,
    size_bytes  bigint      NOT NULL,
    storage_key text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  ```
- Adds index `idx_attachments_task_id`
- `storage_key` holds the internal MinIO object path and is never returned in API responses

**V15\_\_story_points.sql**

- Adds the `story_points` integer column to the `tasks` table:
  ```sql
  ALTER TABLE tasks ADD COLUMN story_points integer;
  ```
- Column is **nullable** — existing tasks without story points remain `NULL`
- No default value; intended to be set explicitly by users in the task edit form
- Accepted via `CreateTaskRequest` and `UpdateTaskRequest` inner records in `TaskController`; persisted through `task.setStoryPoints(req.storyPoints())`
- Exposed in `TaskDto` as `Integer storyPoints` (mapped from `t.getStoryPoints()` in `TaskDto.from(Task)`)
- Frontend: rendered as a `(N pts)` badge on task cards and list rows; editable via a 0–100 number input in `TaskModal`; summed for active-sprint done tasks on the Dashboard as the **Sprint Velocity** stat card

---

### 4.8 Application Configuration

`backend/src/main/resources/application.yml`

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/taskflow
    username: taskflow
    password: taskflow
  jpa:
    hibernate.ddl-auto: none # Flyway manages all DDL
    show-sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration
  mail:
    host: ${MAIL_HOST:localhost}
    port: ${MAIL_PORT:1025}
    username: ${MAIL_USERNAME:}
    password: ${MAIL_PASSWORD:}

server:
  port: 4000

app:
  jwt:
    secret: ${JWT_SECRET} # Must be set via environment
    expiration-hours: 24
  mail:
    from: ${MAIL_FROM:noreply@taskflow.local}
    enabled: ${MAIL_ENABLED:false} # set true to activate hourly digest
  minio:
    endpoint: ${MINIO_ENDPOINT:http://localhost:9000}
    public-endpoint: ${MINIO_PUBLIC_ENDPOINT:http://localhost:9002}
    access-key: ${MINIO_USER:taskflow}
    secret-key: ${MINIO_PASSWORD:taskflow123}
    bucket: ${MINIO_BUCKET:taskflow}
```

---

### 4.9 Dependencies

Key dependencies from `pom.xml`:

| Dependency                       | Version | Purpose                    |
| -------------------------------- | ------- | -------------------------- |
| `spring-boot-starter-web`        | 3.5.0   | REST API + embedded Tomcat |
| `spring-boot-starter-security`   | 3.5.0   | Security filter chain      |
| `spring-boot-starter-data-jpa`   | 3.5.0   | ORM / database access      |
| `spring-boot-starter-validation` | 3.5.0   | Bean validation            |
| `postgresql`                     | —       | JDBC driver                |
| `flyway-core`                    | —       | Database migration         |
| `jjwt-api/impl/jackson`          | 0.12.6  | JWT creation & parsing     |
| `lombok`                         | 1.18.46 | Boilerplate reduction      |
| `spring-boot-starter-mail`       | 3.5.0   | Email digest (optional)    |
| `io.minio:minio`                 | 8.5.17  | MinIO object storage SDK   |

**Frontend npm packages (key additions beyond React/Vite):**

| Package              | Version | Purpose                       |
| -------------------- | ------- | ----------------------------- |
| `react-router-dom`   | 6.x     | Client-side routing           |
| `@dnd-kit/core`      | 6.x     | Drag-and-drop primitives      |
| `@dnd-kit/sortable`  | 10.x    | Sortable lists/columns        |
| `@dnd-kit/utilities` | 3.x     | DnD helper utilities          |
| `recharts`           | 2.x     | SVG chart library (Dashboard) |

---

## 5. Frontend — React / TypeScript

The frontend lives in `frontend/src/`.

### 5.1 Type Definitions

`src/types.ts` — All shared TypeScript types used across the app.

```typescript
type User = { id: string; name: string; email: string };

type Label = {
  id: string;
  project_id: string;
  name: string;
  color: string;
};

type ProjectMember = {
  project_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
};

type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  members?: ProjectMember[]; // present in list & detail responses
};

type Sprint = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "planning" | "active" | "completed";
  created_at: string;
};

type Task = {
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
  story_points: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  labels: Label[];
};

type Comment = {
  id: string;
  task_id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } }
  | { type: "task_moved"; data: Task }
  | { type: "comment_added"; data: Comment }
  | { type: "comment_updated"; data: Comment }
  | {
      type: "comment_deleted";
      data: { id: string; task_id: string; project_id: string };
    }
  | { type: "sprint_started"; data: Sprint }
  | { type: "sprint_completed"; data: Sprint }
  | { type: "activity_created"; data: ActivityEvent };

type ActivityEvent = {
  id: string;
  project_id: string;
  task_id: string | null;
  actor_id: string;
  actor_name: string;
  type: string;
  payload: Record<string, string>;
  created_at: string;
};

type ProjectStats = {
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

type SearchResult = {
  project_id: string;
  project_name: string;
  tasks: Task[];
};

type Notification = {
  id: string;
  user_id: string;
  type: "task_assigned" | "comment_added" | string;
  payload: Record<string, string>;
  read: boolean;
  created_at: string;
};

type Attachment = {
  id: string;
  task_id: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => void;
  logout: () => void;
};
```

---

### 5.2 API Client

`src/api/client.ts` — Generic HTTP fetch wrapper.

- Base URL: `VITE_API_URL` env var, falls back to `http://localhost:4000`
- All requests set `Content-Type: application/json`
- Attaches `Authorization: Bearer {token}` when a token is provided
- Returns `undefined` on `204 No Content` responses
- On non-2xx: throws an error with the API's `field`/`error` message
- Supports `GET`, `POST`, `PATCH`, `DELETE`

**Search helpers exported from `client.ts`:**

- `searchInProject(projectId, q, token)` → calls `GET /projects/{id}/tasks/search?q=` — returns `{ tasks: Task[] }`
- `globalSearch(q, token)` → calls `GET /search?q=` — returns `{ results: SearchResult[] }`

**Label helpers exported from `client.ts`:**

- `fetchLabels(projectId, token)` → calls `GET /projects/{id}/labels` — returns `{ labels: Label[] }`
- `createLabel(projectId, data, token)` → calls `POST /projects/{id}/labels`
- `updateLabel(projectId, labelId, data, token)` → calls `PATCH /projects/{id}/labels/{labelId}`
- `deleteLabel(projectId, labelId, token)` → calls `DELETE /projects/{id}/labels/{labelId}`
- `attachLabel(projectId, taskId, labelId, token)` → calls `POST /projects/{id}/tasks/{taskId}/labels/{labelId}`
- `detachLabel(projectId, taskId, labelId, token)` → calls `DELETE /projects/{id}/tasks/{taskId}/labels/{labelId}`

**Notification helpers exported from `client.ts`:**

- `fetchNotifications(token, page?, limit?)` → calls `GET /notifications` — returns `{ notifications: Notification[], total: number }`
- `fetchNotificationCount(token)` → calls `GET /notifications/count` — returns `{ unread: number }`
- `markNotificationRead(id, token)` → calls `PATCH /notifications/{id}/read`
- `markAllNotificationsRead(token)` → calls `PATCH /notifications/read-all`

**Attachment helpers exported from `client.ts`:**

- `fetchAttachments(projectId, taskId, token)` → calls `GET /projects/{id}/tasks/{taskId}/attachments` — returns `{ attachments: Attachment[] }`
- `uploadAttachment(projectId, taskId, file, token, onProgress?)` → `XMLHttpRequest` multipart POST to `POST /projects/{id}/tasks/{taskId}/attachments`; `onProgress` callback receives `0–100` percent for the progress bar
- `deleteAttachment(projectId, taskId, attachmentId, token)` → calls `DELETE /projects/{id}/tasks/{taskId}/attachments/{attachmentId}`
- Downloads are performed inline via `fetch` with an `Authorization` header, converted to a blob URL, and triggered via a temporary `<a download>` element — no separate helper function is needed

---

### 5.3 Auth Context & Flow

`src/context/AuthContext.tsx`

**Storage keys in `localStorage`:**
| Key | Value |
|---|---|
| `taskflow_token` | JWT string |
| `taskflow_user` | JSON-serialized `User` object |
| `taskflow_dark` | `"true"` or `"false"` |

**`AuthProvider`** wraps the entire app:

- Reads token and user from `localStorage` on initial load (persists login across page refreshes)
- `login(email, password)` → calls `POST /auth/login`, stores token + user in state and `localStorage`
- `register(name, email, password)` → calls `POST /auth/register`, stores token + user
- `logout()` → clears all three `localStorage` keys, resets state

**`useAuth()`** — hook to consume auth context in any component.

**`Protected`** component (`src/components/Protected.tsx`):

- Wraps private routes
- If no token is present, redirects to `/login`
- Otherwise renders children

---

### 5.4 Pages & Routing

Routes are defined in `src/App.tsx` using React Router v6.

| URL                       | Component                    | Auth      |
| ------------------------- | ---------------------------- | --------- |
| `/`                       | Redirect to `/projects`      | —         |
| `/login`                  | `AuthPage` (mode="login")    | Public    |
| `/register`               | `AuthPage` (mode="register") | Public    |
| `/projects`               | `ProjectsPage`               | Protected |
| `/projects/:id`           | `ProjectDetailPage`          | Protected |
| `/projects/:id/board`     | `BoardPage`                  | Protected |
| `/projects/:id/dashboard` | `DashboardPage`              | Protected |

---

#### `AuthPage` (`src/pages/AuthPage.tsx`)

Login and registration form with two modes (toggled by the mode prop):

**Login mode:**

- Email + password fields
- Pre-filled with `test@example.com` / `password123` for easy demo
- Password visibility toggle (eye icon)
- Calls `login()` from auth context on submit
- Redirects to `/projects` on success

**Register mode:**

- Name + email + password fields
- Client-side validation: name required, valid email format, password ≥ 8 characters
- Shows success toast for 1200ms, then redirects to `/login`

Both modes:

- Display API error messages inline
- Show loading state on submit button
- Link to toggle between login and register
- Pressing **Enter** in any field submits the form (submit button has `type="submit"`)

---

#### `ProjectsPage` (`src/pages/ProjectsPage.tsx`)

Main dashboard showing all accessible projects.

**Features:**

- **Create project form** at the top: name (required) + description (optional)
- **Project grid**: CSS Grid, auto-fit columns (min 260px), 12 projects per page
- **Project cards**: show name, description snippet, stacked member avatar bubbles (up to 5, then `+N` overflow), and "Open" pill
- **Pagination**: Prev/Next controls when total > 12
- **Empty state**: shown when no projects exist
- **Loading state**: shown while fetching
- Clicking a card navigates to `/projects/:id`
- Creating a project immediately refreshes the list

---

#### `ProjectDetailPage` (`src/pages/ProjectDetailPage.tsx`)

The main working view for a single project. Most complex page in the app.

**Header section:**

- Project name and description
- If current user is the project owner: Edit button (opens inline form) and Delete button
- "New Task" button (opens `TaskModal`)
- Live status badge (green pulsing dot when SSE is connected, grey when not)

**Left sidebar navigation** (via `ProjectSidebar` component):

- **Tasks** — main task list view (default)
- **Members** — shows member count pill; membership management panel
- **Activity** — project-level activity feed
- **Labels** — label management panel; shows label count pill
- **Board ⚡** — navigates to `/projects/:id/board`
- **Dashboard 📊** — navigates to `/projects/:id/dashboard`
- Active tab highlighted; board/dashboard active state detected via URL path

**Members tab:**

- Lists all project members with avatar initials, name, email, and role badge (gold = owner, blue = admin, grey = member, light grey = viewer)
- Project owner and admins see an **Invite member** button that opens `InviteMemberModal`
- Project owner can change any non-owner member's role via an inline dropdown, or remove them

**Filter toolbar (Tasks tab):**

- Status filter dropdown: All / Todo / In Progress / Blocked / In Review / Done
- Assignee filter dropdown: All + list of all users (fetched from `GET /users`)
- Filters are applied together (both can be active simultaneously)
- Changing filters resets to page 1

**Kanban Board (5 columns):**

- Columns: **Todo** | **In Progress** | **Blocked** | **In Review** | **Done**
- HTML5 Drag-and-Drop: tasks can be dragged between columns
  - Drop on a column → optimistic status update in UI
  - `PATCH` request sent to backend
  - Reverts to original status if request fails
  - Drag-over highlights the target column with a dashed outline
- Pagination within the filtered task list (Prev/Next)

**Task Cards:**

- Short task ID prefix (first 8 chars of UUID, e.g. `#8b01b617`) shown in monospace beside the title
- Title (bold)
- Description or "No description" in muted text
- Priority pill (color-coded: red = high, yellow = medium, blue = low)
- Assignee name or "Unassigned"
- Due date (if set)
- Status dropdown (can change status inline without opening the modal)
- Edit button → opens `TaskModal` pre-filled with task data
- Delete button → confirms and calls `DELETE /tasks/{id}`

**Real-time updates via SSE:**

- `task_created` → new task inserted into the correct column
- `task_updated` → task updated in place across all columns
- `task_deleted` → task removed from the board immediately
- Works across multiple open browser tabs simultaneously

---

### 5.5 Components

#### `Layout` (`src/components/Layout.tsx`)

- Full-page shell rendered around every protected page
- **Nav bar**: Brand logo (links to `/projects`), **global search bar** (centre), `NotificationBell` (when logged in), logged-in user's name, Logout button
- Dark/light toggle uses `useDarkMode` hook
- Logout calls `logout()` from auth context

**Global search bar (in the nav):**

- Centred `<input type="search">` with `max-width: 380px`
- Debounces input by **300 ms** before calling `GET /search?q=`
- Requires at least **2 characters** to trigger a search
- Shows a dropdown panel below the input with results grouped by project
- Each result row shows: `TypeIcon`, task title (with matched text **highlighted in yellow**), status pill
- Clicking a result navigates to `/projects/:id` and clears the search
- Dropdown closes when clicking anywhere outside the search wrapper
- Keyboard / click events handled; `aria-label` and `role="listbox"` / `role="option"` for accessibility

#### `TaskModal` (`src/components/TaskModal.tsx`)

- Slide-in drawer panel for creating or editing a task
- **Create mode**: all fields empty (except defaults); submit button labelled **"Create task"**
- **Edit mode**: pre-filled with existing task data; submit button labelled **"Save task"**
- Both modes show **"Saving..."** while the request is in flight
- **Fields**: title (required), description, type (Task/Bug/Story/Epic), status, priority, assignee (dropdown of all users), sprint (dropdown — "Backlog (no sprint)" default, active sprints marked with `▶ Active`, completed with `✓`), due date (date picker — **required**; past dates blocked with `min` attribute and submit guard; labelled "Due date \*")
- On save: calls `POST` (create) or `PATCH` (edit) and closes panel
- Displays API errors inline
- **Parent breadcrumb**: when editing a subtask, shows a clickable "Parent: [title]" link that navigates to the parent task
- **Subtasks section** (only for non-subtask tasks): lists direct child tasks with type icon and status pill; inline "Add subtask" form
- **Comments section**: loads comments on open, live-appends via SSE `comment_added`, supports edit/delete own comments
- **Activity section**: loads task-scoped activity feed from `GET /projects/{id}/tasks/{taskId}/activity`; live-appends new events via SSE `activity_created`

#### `Field` (`src/components/Field.tsx`)

- Reusable form field wrapper
- Renders a `<label>` above the child `<input>` or `<select>`
- Used throughout forms for consistent spacing

#### `Protected` (`src/components/Protected.tsx`)

- Route guard component
- Reads token from `useAuth()`
- Redirects to `/login` if not authenticated; renders `<Outlet />` otherwise

#### `icons` (`src/components/icons.tsx`)

- SVG icon components:
  - `EyeIcon` — show password
  - `EyeOffIcon` — hide password
  - `MoonIcon` — dark mode indicator
  - `SunIcon` — light mode indicator
  - `ArrowLeftIcon` — back navigation

#### `MemberList` (`src/components/MemberList.tsx`)

- Renders the ordered list of project members
- Each row: avatar circle (initials), name + email, role badge, and (for owner) role-change dropdown + Remove button
- Role badge colours: owner = gold, admin = blue, member = grey, viewer = light grey

#### `InviteMemberModal` (`src/components/InviteMemberModal.tsx`)

- Modal dialog for inviting a user by email
- Fields: email (validated), role selector (admin / member / viewer)
- Calls `POST /projects/{id}/members` and notifies parent on success

#### `LabelChip` (`src/components/LabelChip.tsx`)

- Renders a small colored pill for a label
- Background color set from `label.color`; text color (white or dark) computed via luminance check for readability
- Optional `×` remove button via `onRemove` prop; `e.stopPropagation()` prevents card click-through
- Used in `LabelPicker` (selected labels row) and on task cards

#### `LabelPicker` (`src/components/LabelPicker.tsx`)

- Multi-select dropdown for attaching/detaching labels on a task
- Shows currently applied labels as `LabelChip` components with `×` to detach
- **"＋ Labels"** toggle button opens a dropdown listing available (unselected) labels
- Clicking an available label calls `onAttach`; clicking `×` on a chip calls `onDetach`
- Closes on click outside via `mousedown` listener
- Empty states: `"No labels yet — create some below"` (no labels exist) and `"All labels applied"` (all already attached)

#### `ProjectSidebar` (`src/components/ProjectSidebar.tsx`)

Vertical left-side navigation panel inside `ProjectDetailPage`.

- **Tab buttons**: Tasks, Members (with `memberCount` pill), Activity, Labels (with `labelCount` pill)
- **Navigation links**: Board ⚡ (`/projects/:id/board`), Dashboard 📊 (`/projects/:id/dashboard`)
- A `sidebar-divider` visually separates tab buttons from page navigation links
- Active state: tab buttons use `activeTab` prop; board/dashboard links detected via `useLocation` path match
- Navigation: within `ProjectDetailPage`, tab buttons call `onTabChange` callback; otherwise navigates via `?tab=` query param

#### `ActivityFeed` (`src/components/ActivityFeed.tsx`)

Timeline-style activity feed component used in both the **Activity tab** of `ProjectDetailPage` and the **Activity section** inside `TaskModal`.

- Accepts `events: ActivityEvent[]` and `loading?: boolean` props
- Renders each event as a row: coloured icon + human-readable sentence + relative timestamp
- **Icon colours by event type:**
  - ✚ green — `task_created`, `subtask_created`
  - ✕ red — `task_deleted`
  - ↔ blue — `status_changed`, `task_moved`
  - ! amber — `priority_changed`
  - ⬡ purple — `type_changed`
  - 👤 green — `assignee_changed`, member events
  - 📅 orange — `due_date_changed`
  - ⚡ yellow — `sprint_changed`, sprint events
  - ✏ blue — `title_changed`, `task_updated`
  - 💬 purple — comment events
- **Human-readable messages per event type:**
  | Event | Message |
  |---|---|
  | `task_created` | `Alice created task "Foo"` |
  | `subtask_created` | `Alice added subtask "Bar"` |
  | `status_changed` | `Alice changed status of "Foo" from Todo to In Progress` |
  | `priority_changed` | `Alice changed priority of "Foo" from MEDIUM to HIGH` |
  | `type_changed` | `Alice changed type of "Foo" from task to bug` |
  | `title_changed` | `Alice renamed task from "Old" to "New"` |
  | `assignee_changed` | `Alice changed assignee of "Foo" from Unassigned to Bob` |
  | `due_date_changed` | `Alice changed due date of "Foo" from none to 2026-05-10` |
  | `sprint_changed` | `Alice moved "Foo" from Backlog to Sprint 1` |
  | `comment_added` | `Alice commented on "Foo"` |
  | `sprint_started` | `Alice started sprint "Sprint 1"` |
  | `member_added` | `Alice added Bob as member` |
- **Timestamp format:**
  - < 1 minute → `just now`
  - < 1 hour → `5m ago`
  - < 24 hours → `3h ago`
  - ≥ 24 hours → full date/time: `8 May 2026, 10:30` (en-GB locale)

#### `TypeIcon` (`src/components/TypeIcon.tsx`)

- Renders a small inline SVG icon for a task type
- **Task** — blue rounded square with checkmark
- **Bug** — red circle with antenna legs
- **Story** — green bookmark
- **Epic** — purple lightning bolt
- Accepts `type`, `size` (default 14px), and optional `style` props
- Shows an **instant CSS tooltip** (no browser delay) with the type name on hover via `data-tooltip` + `::after` pseudo-element
- Used on task cards, inside `TaskModal` header, and in the subtask list

#### `NotificationBell` (`src/components/NotificationBell.tsx`)

Bell icon with real-time notification panel, mounted in the `Layout` nav bar.

**On mount:**

- Calls `GET /notifications/count` immediately and every **30 seconds** (polling fallback)
- Opens a personal SSE connection to `GET /notifications/events` for live push

**Unread badge:**

- Red circle above the bell icon showing the unread count (capped at `99+`)

**Dropdown panel (opens on click):**

- Loads full notification list from `GET /notifications` on first open
- Each row: emoji icon (📋 = task assigned, 💬 = comment), human-readable message, relative timestamp (`just now` / `5m ago` / `3h ago`), blue dot for unread items
- Clicking a row calls `PATCH /notifications/{id}/read`, decrements the badge, and navigates to `/projects/{projectId}`
- **"Mark all read"** button — calls `PATCH /notifications/read-all`, zeroes the badge
- Dropdown closes when clicking outside

**Toast notifications:**

- When a `notification` SSE event arrives: unread count incremented, item prepended to panel list, and a **toast** pops up in the bottom-right corner
- Toast auto-dismisses after **4 seconds**; has an `×` manual dismiss button
- No external toast library — plain inline styles

---

#### `TaskCard` (`src/components/TaskCard.tsx`)

- Reusable draggable task card used on the Kanban board (`BoardPage`)
- Layout matches the Tasks tab design exactly:
  - `TypeIcon` + short task ID (`#8b01b617` monospace) + task title (h3)
  - Description or "No description." in muted text
  - Priority pill (color-coded) + assignee name pill in a flex row
  - Due date text (red if overdue)
  - Optional inline status dropdown via `onStatusChange` prop — changes status directly without opening the modal
  - **📎N** paperclip badge shown when `attachmentCount > 0` (count passed as optional prop)
- Accepts a `dragging` boolean prop — shows 0.4 opacity and `grabbing` cursor while being dragged
- Accepts a `ref` for `@dnd-kit` sortable integration
- `onClick` opens the full `TaskModal` for the task

#### `AttachmentZone` / `AttachmentList` (`src/components/AttachmentZone.tsx`)

Two co-located components rendered inside `TaskModal` between the Comments and Activity sections.

**`AttachmentList`:**

- Renders the list of existing attachments for a task (reloads whenever `taskId` changes)
- Each row: file icon (by MIME type — image/PDF/doc/text/generic), filename, formatted size (KB/MB), uploader name, relative date, **Download** button, **Delete** button (visible if uploader or project owner)
- **Download**: calls `GET /attachments/{id}/download` via `fetch` with JWT header → receives binary stream → creates a blob URL → triggers browser download via a temporary `<a download>` element
- **Delete**: calls `deleteAttachment()` → removes row from list on success

**`AttachmentZone`:**

- Drag-and-drop file upload area inside the task detail panel
- Accepts files via drag-and-drop or click-to-browse (`<input type="file" multiple>`)
- Calls `uploadAttachment()` with `onProgress` callback — shows a **progress bar** (0–100 %)
- On upload complete: refreshes the `AttachmentList`
- Validates client-side that the file is not over 50 MB before uploading (shows inline error otherwise)

#### `DashboardPage` (`src/pages/DashboardPage.tsx`)

Chart-based analytics page at `/projects/:id/dashboard`, accessible via the **"Dashboard 📊"** tab link in `ProjectDetailPage`.

**Stat cards (top row):**

- **Total tasks** — sum of all statuses
- **To Do** — grey
- **In Progress** — blue
- **Done** — green
- **Overdue** — red (tasks where `due_date < today` and not done)

**Charts (all powered by `recharts` with `ResponsiveContainer`):**

| Chart                | Type | Data source                                                |
| -------------------- | ---- | ---------------------------------------------------------- |
| Tasks by Status      | Pie  | `by_status` — grey/blue/green segments                     |
| Tasks by Type        | Pie  | `by_type` — purple/red/green/amber for task/bug/story/epic |
| Tasks by Assignee    | Bar  | `by_assignee` — brand-green bars                           |
| Tasks by Sprint      | Bar  | `by_sprint` — purple bars; unassigned = "Backlog"          |
| Tasks Closed Per Day | Line | `daily_done` — last 14 days, green line                    |

- Pie charts use `outerRadius={70}`, `height={260}`, `margin` padding, and `labelLine` to prevent label clipping
- Bar charts rotate X-axis labels 30° for long names
- Line chart shows day labels in `"8 May"` format (en-GB locale)
- Each chart card shows `"No data"` gracefully when the dataset is empty
- Breadcrumb link `← ProjectName / Dashboard` at the top

#### `BoardPage` (`src/pages/BoardPage.tsx`)

Full Kanban board page at `/projects/:id/board`, built with `@dnd-kit/core` and `@dnd-kit/sortable`.

**Sprint management panel (top bar):**

- Sprint selector dropdown — shows all sprints for the project; highlights the active sprint
- **Start** / **Complete** sprint buttons (visible based on current sprint status)
- **+ Create Sprint** button — opens `CreateSprintModal`

**`CreateSprintModal`:**

- Fields: Sprint Name (required), Goal (optional), Start date (**required**, must be ≥ today, labelled "Start date _"), End date (**required**, must be ≥ start date, labelled "End date _")
- Date inputs have `min` attributes and `onChange` guards; submit is blocked if either date is missing or invalid

**Kanban columns (3 columns):**

- **To Do** | **In Progress** | **Done**
- Each column uses `SortableContext` (vertical list strategy)
- Drag-over highlights column with a dashed brand-colour border
- Empty columns show a "Drop tasks here" placeholder

**Drag-and-drop:**

- Powered by `@dnd-kit/core` — `DndContext` with `PointerSensor` (8px activation distance)
- `onDragEnd` detects column change → calls `PATCH /tasks/{id}/position` with new `status`
- Optimistic update applied immediately; reverts on API failure
- `DragOverlay` renders a ghost copy of the dragged card at cursor position

**Backlog section (below columns):**

- Shows tasks not assigned to any sprint
- Each row: TypeIcon + priority dot + #shortId + title + assignee avatar + due date chip + "+ Add to sprint" button
- "+ Add to sprint" assigns the task to the currently selected sprint

**SSE integration:**

- Listens for `task_created`, `task_updated`, `task_deleted`, `task_moved`, `sprint_started`, `sprint_completed`
- Board updates in real-time across all browser tabs

---

### 5.6 Custom Hooks

#### `useDarkMode` (`src/hooks/useDarkMode.ts`)

```typescript
const [dark, toggleDark, resetDark] = useDarkMode();
```

- Reads initial value from `localStorage` key `taskflow_dark`
- Toggles the `.dark` class on `<html>` element (enables CSS dark-mode variables)
- Persists preference to `localStorage`
- Returns current state, toggle function, and reset function

#### `useProjectEvents` (`src/hooks/useProjectEvents.ts`)

```typescript
const isConnected = useProjectEvents(
  projectId,
  token,
  (event: SSETaskEvent) => {
    // Handle task/sprint/comment events
  },
  (activityEvent: ActivityEvent) => {
    // Handle activity_created events
  },
);
```

- Creates a native `EventSource` to `GET /projects/{id}/events?token=JWT`
- Listens for named events: `task_created`, `task_updated`, `task_deleted`, `task_moved`, `sprint_started`, `sprint_completed`, `comment_added`, `comment_deleted`, `activity_created`
- The optional fourth parameter `onActivityEvent` is called for `activity_created` events; uses a ref internally to avoid stale closure issues
- Parses JSON payloads and calls the appropriate callback
- Returns a boolean indicating whether the SSE connection is active
- Automatically closes the `EventSource` on component unmount or when `projectId`/`token` changes

---

### 5.7 Utilities

#### `labelStatus` (`src/utils/labelStatus.ts`)

```typescript
labelStatus("todo"); // → "Todo"
labelStatus("in_progress"); // → "In progress"
labelStatus("blocked"); // → "Blocked"
labelStatus("in_review"); // → "In Review"
labelStatus("done"); // → "Done"
```

Used to convert raw status enum values to human-readable labels in the UI.

---

### 5.8 Styling

The app uses **Tailwind CSS v4** (via `@import "tailwindcss"` in `main.css`) with design tokens defined as `@theme` CSS custom properties. All component class strings live in `src/styles/classes.ts` as exported string constants consumed via `import * as cx from "../styles/classes"`.

`src/main.css` — Global stylesheet (Tailwind import + design tokens + base resets only).

**Color tokens (defined in `@theme`, light mode defaults):**

| Variable               | Value                 | Usage                        |
| ---------------------- | --------------------- | ---------------------------- |
| `--color-bg`           | `#f6f7f3`             | Page background              |
| `--color-bg-card`      | `#ffffff`             | Card/modal background        |
| `--color-text`         | `#1e2623`             | Primary text                 |
| `--color-text-muted`   | `#65706b`             | Secondary / description text |
| `--color-brand`        | `#1f5b45`             | Primary brand color (teal)   |
| `--color-border`       | `#dfe4dc`             | Card borders                 |
| `--color-border-input` | `#cdd5cf`             | Input field borders          |
| `--color-pill-bg`      | `#e8efe7`             | Badge backgrounds            |
| `--color-error-border` | `#b42318`             | Error state borders          |
| `--shadow-card`        | `rgba(35,51,45,0.08)` | Card drop shadows            |

**`src/styles/classes.ts`** — Shared Tailwind class string constants:

| Export                                            | Purpose                                      |
| ------------------------------------------------- | -------------------------------------------- |
| `cx.fieldInput`                                   | `<input>` — full border, rounded, focus ring |
| `cx.fieldSelect`                                  | `<select>` — same as fieldInput              |
| `cx.fieldTextarea`                                | `<textarea>` — same + min-height + resize-y  |
| `cx.commentFormTextarea`                          | Textarea inside comment forms                |
| `cx.btn`                                          | Primary button (brand background)            |
| `cx.btnSecondary`                                 | Outlined secondary button                    |
| `cx.btnDanger`                                    | Red destructive button                       |
| `cx.card`                                         | Bordered card with shadow                    |
| `cx.modal` / `cx.modalBackdrop`                   | Modal overlay + content box                  |
| `cx.drawer` / `cx.drawerHeader` / `cx.drawerBody` | Right slide-in task panel                    |
| `cx.searchWrapper` / `cx.searchDropdown`          | Global search bar + dropdown                 |
| `cx.labelChip` / `cx.labelPickerDropdown`         | Label pills + picker dropdown                |

**Form element border policy:** every `<input>`, `<select>`, and `<textarea>` across all pages and components uses one of `cx.fieldInput`, `cx.fieldSelect`, `cx.fieldTextarea`, or `cx.commentFormTextarea` to ensure consistent borders, focus states, and background colors.

**Dark mode** (activated by `.dark` class on `<html>`):

- All `@theme` color tokens are overridden with higher-contrast dark equivalents
- Brand color lightens to `#5bbf94` for visibility on dark backgrounds

---

## 6. Feature Map — Frontend ↔ Backend Coverage

| Feature                          | Frontend                                                                                            | Backend                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| User registration                | `AuthPage` (register mode)                                                                          | `POST /auth/register`                                                  |
| User login                       | `AuthPage` (login mode)                                                                             | `POST /auth/login`                                                     |
| JWT storage & reuse              | `AuthContext`, `localStorage`                                                                       | `JwtUtil`, `JwtAuthFilter`                                             |
| Logout                           | `Layout` nav bar                                                                                    | (stateless, client-side only)                                          |
| List projects                    | `ProjectsPage`                                                                                      | `GET /projects`                                                        |
| Create project                   | `ProjectsPage` form                                                                                 | `POST /projects`                                                       |
| View project detail              | `ProjectDetailPage`                                                                                 | `GET /projects/{id}`                                                   |
| Edit project                     | `ProjectDetailPage` edit form                                                                       | `PATCH /projects/{id}`                                                 |
| Delete project                   | `ProjectDetailPage` delete button                                                                   | `DELETE /projects/{id}`                                                |
| Project stats / Dashboard        | `DashboardPage` at `/projects/:id/dashboard` — stat cards + 5 recharts                              | `GET /projects/{id}/stats`                                             |
| List tasks (with filters)        | `ProjectDetailPage` filter toolbar                                                                  | `GET /projects/{id}/tasks?status=&assignee=`                           |
| Create task                      | `TaskModal` (create) — due date **required**                                                        | `POST /projects/{id}/tasks`                                            |
| Edit task                        | `TaskModal` (edit) — due date **required**                                                          | `PATCH /projects/{id}/tasks/{taskId}`                                  |
| Delete task                      | Task card delete button                                                                             | `DELETE /projects/{id}/tasks/{taskId}`                                 |
| Change task status inline        | Task card status dropdown                                                                           | `PATCH /projects/{id}/tasks/{taskId}`                                  |
| Drag-and-drop status change      | Kanban column DnD (both `ProjectDetailPage` + `BoardPage`)                                          | `PATCH /projects/{id}/tasks/{taskId}/position`                         |
| Real-time task updates           | `useProjectEvents` + SSE hook                                                                       | `SseController` + `EventBroker`                                        |
| List all users (assignee)        | `TaskModal` assignee dropdown                                                                       | `GET /users`                                                           |
| Pagination                       | `ProjectsPage`, `ProjectDetailPage`                                                                 | `?page=&limit=` on all list endpoints                                  |
| Dark mode                        | `useDarkMode` hook + `Layout` toggle                                                                | — (client-side only)                                                   |
| Health check                     | —                                                                                                   | `GET /healthz`                                                         |
| List project members             | `MemberList` in Members tab                                                                         | `GET /projects/{id}/members`                                           |
| Invite project member            | `InviteMemberModal`                                                                                 | `POST /projects/{id}/members`                                          |
| Change member role               | Inline role dropdown in `MemberList`                                                                | `PATCH /projects/{id}/members/{userId}`                                |
| Remove member                    | Remove button in `MemberList`                                                                       | `DELETE /projects/{id}/members/{userId}`                               |
| Member avatars on cards          | `MemberAvatars` in `ProjectsPage`                                                                   | Members included in `GET /projects` response                           |
| Task types (Task/Bug/Story/Epic) | `TypeIcon` component + type selector in `TaskModal`                                                 | `type` field on `Task` entity/DTO                                      |
| Subtasks                         | Subtask list + add form in `TaskModal`; parent breadcrumb                                           | `GET /projects/{id}/tasks/{taskId}/subtasks`                           |
| Task comments                    | Comments section in `TaskModal`, live via SSE                                                       | `GET/POST/PATCH/DELETE /projects/{id}/tasks/{taskId}/comments`         |
| Activity log (project feed)      | Activity tab in `ProjectDetailPage`, `ActivityFeed` component                                       | `GET /projects/{id}/activity`                                          |
| Activity log (task feed)         | Activity section in `TaskModal`, live via SSE `activity_created`                                    | `GET /projects/{id}/tasks/{taskId}/activity`                           |
| Specific activity per field      | `ActivityFeed` — field-specific messages with from/to values                                        | Per-field conditional logs in `TaskController.updateTask()`            |
| Subtask creation → parent feed   | Parent task's Activity section shows `subtask_created` event                                        | `ActivityService.log()` called against parent task after save          |
| Due date validation              | `min` attr + submit guard in `TaskModal` — **mandatory**                                            | Server-side date parse validation                                      |
| Click task card to open          | `onClick` on `<article>` in `ProjectDetailPage`                                                     | —                                                                      |
| Sprints (CRUD)                   | `BoardPage` sprint panel + `CreateSprintModal`                                                      | `GET/POST/PATCH/DELETE /projects/{id}/sprints`                         |
| Sprint date validation           | `min` attr + submit guard — start **≥ today**, end **≥ start**                                      | — (frontend only)                                                      |
| Sprint task assignment           | Backlog "+ Add to sprint" button in `BoardPage`                                                     | `POST/DELETE /projects/{id}/sprints/{sprintId}/tasks/{taskId}`         |
| Sprint start / complete          | Start / Complete buttons in `BoardPage`                                                             | `PATCH /projects/{id}/sprints/{sprintId}` with `status`                |
| Kanban board (full)              | `BoardPage` at `/projects/:id/board`                                                                | `PATCH /projects/{id}/tasks/{taskId}/position`                         |
| Drag-and-drop between columns    | `@dnd-kit` in `BoardPage`                                                                           | `PATCH /projects/{id}/tasks/{taskId}/position`                         |
| Real-time sprint/board events    | `useProjectEvents` — `task_moved`, `sprint_started`, `sprint_completed`                             | `EventBroker`                                                          |
| List project labels              | Labels tab in `ProjectDetailPage`                                                                   | `GET /projects/{id}/labels`                                            |
| Create / edit / delete label     | Labels tab inline form in `ProjectDetailPage`                                                       | `POST/PATCH/DELETE /projects/{id}/labels/{labelId?}`                   |
| Attach label to task             | `LabelPicker` in `TaskModal`                                                                        | `POST /projects/{id}/tasks/{taskId}/labels/{labelId}`                  |
| Detach label from task           | `LabelChip` × button in `LabelPicker`                                                               | `DELETE /projects/{id}/tasks/{taskId}/labels/{labelId}`                |
| Labels displayed on task cards   | `LabelChip` components on task cards and in `TaskModal`                                             | `labels` field in `TaskDto`                                            |
| In-app notifications             | `NotificationBell` in `Layout` nav — bell, badge, dropdown, toasts                                  | `GET/PATCH /notifications`, `GET /notifications/count`                 |
| Real-time notification push      | SSE `notification` event via personal channel in `NotificationBell`                                 | `NotificationSseController` + `EventBroker.publishToUser()`            |
| Notify on task assignment        | Badge + toast when someone assigns a task to the current user                                       | `NotificationService.notify()` in `TaskController`                     |
| Notify on comment                | Badge + toast when someone comments on the current user's task                                      | `NotificationService.notify()` in `CommentController`                  |
| Email digest (optional)          | — (server-side only)                                                                                | `EmailService` `@Scheduled` hourly; enabled via `MAIL_ENABLED`         |
| Upload file attachment           | `AttachmentZone` drag-and-drop + progress bar in `TaskModal`                                        | `POST /projects/{id}/tasks/{taskId}/attachments`                       |
| List file attachments            | `AttachmentList` inside `TaskModal`                                                                 | `GET /projects/{id}/tasks/{taskId}/attachments`                        |
| Download file attachment         | Blob URL download via `fetch` + JWT header                                                          | `GET /projects/{id}/tasks/{taskId}/attachments/{id}/download`          |
| Delete file attachment           | Delete button in `AttachmentList` (uploader/owner only)                                             | `DELETE /projects/{id}/tasks/{taskId}/attachments/{id}`                |
| Paperclip badge on task cards    | `TaskCard` `attachmentCount` prop — shows 📎N when > 0                                              | `attachments` count inferred from `AttachmentList` fetch               |
| Story points on task             | Number input (0–100) in `TaskModal`; `(N pts)` badge on cards/list rows                             | `story_points` column on `tasks` (V15); `TaskDto.storyPoints`          |
| Sprint velocity stat             | `DashboardPage` — sum of `story_points` for `done` tasks in active sprint; displayed as a stat card | Computed client-side from tasks fetched via `GET /projects/{id}/tasks` |

> **Note:** The Kanban board and Dashboard are separate pages reachable via tab links from `ProjectDetailPage`. Both share the same project SSE connection for live updates.

---

## 7. Data Flow Diagrams

### Login Flow

```
User submits email/password
    → AuthPage calls login() from AuthContext
    → AuthContext calls POST /auth/login
    → Backend validates email, compares BCrypt hash
    → Backend returns { token, user }
    → AuthContext stores token & user in localStorage + state
    → React Router navigates to /projects
```

### Google OAuth2 Login Flow

```
User clicks "Continue with Google"
    → Browser navigates to GET /oauth2/authorization/google
    → Spring Security redirects to Google consent screen
    → User authenticates with Google
    → Google redirects to GET /login/oauth2/code/google?code=...
    → OAuth2SuccessHandler fires:
        → reads email, name, sub from OAuth2User
        → finds or creates User in DB (upsert by google_id / email)
        → generates JWT via JwtUtil.generateToken(user)
        → redirects to {FRONTEND_URL}/oauth2/callback?token=JWT
    → OAuth2CallbackPage mounts:
        → reads token from URL params
        → decodes JWT payload (base64) for user_id, name, email
        → calls loginWithToken(token, user) → stored in localStorage + state
        → navigates to /projects
```

### Create Task Flow

```
User fills TaskModal and clicks Save
    → TaskModal calls POST /projects/{id}/tasks
    → Backend validates request, saves to DB
    → Backend calls EventBroker.publish(projectId, task_created)
    → HTTP response: 201 TaskDto → TaskModal closes
    → EventBroker pushes SSE event to all subscribers
    → useProjectEvents callback fires on ALL connected clients
    → ProjectDetailPage updates its task list in real-time
```

### Drag-and-Drop Status Change

```
User drags task card to a different column
    → dragover event highlights target column
    → drop event fires with taskId and new status
    → Optimistic update: task moved in React state immediately
    → PATCH /projects/{id}/tasks/{taskId} sent
    → On success: SSE broadcast updates other connected clients
    → On failure: task reverted to original position in state
```

---

## 8. Docker & Deployment

`docker-compose.yml` runs the full stack:

| Service    | Image                            | Port        | Notes                                                                                                                                            |
| ---------- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db`       | `postgres:16`                    | 5432        | Volume-persisted, Flyway migrations auto-run on backend start                                                                                    |
| `backend`  | Built from `backend/Dockerfile`  | 4000        | Requires `JWT_SECRET` env var                                                                                                                    |
| `frontend` | Built from `frontend/Dockerfile` | 5173 / 80   | Nginx serves the Vite build                                                                                                                      |
| `minio`    | `minio/minio:latest`             | 9002 / 9003 | Object storage. API on host port 9002 (maps to container 9000); console on 9003. Internal Docker hostname `minio:9000` used by the `api` service |

**To run the full stack:**

```bash
docker-compose up --build
```

**Backend Dockerfile:** Multi-stage — Maven build → slim JRE runtime image.

**Frontend Dockerfile:** Multi-stage — Node/Vite build → Nginx serve static files. `nginx.conf` handles SPA routing (all paths serve `index.html`).

---

## 9. Seed Data (Test Credentials)

After running migrations, the following users are available:

| Name             | Email                      | Emp ID  | Password      |
| ---------------- | -------------------------- | ------- | ------------- |
| Test User        | `test@example.com`         | `test`  | `password123` |
| Alex Johnson     | `alex@example.com`         | `are01` | `password123` |
| Aman Choudhary   | `aman.choudhary@hrs.com`   | `ach51` | `password123` |
| Gaganajeet Singh | `gaganajeet.singh@hrs.com` | `gsi50` | `password123` |
| Umang Yadav      | `umang.yadav@hrs.com`      | `uya01` | `password123` |

The auth page pre-fills `test@example.com` / `password123` to make demo login instant.

One project ("Website Redesign") and three sample tasks are seeded so the app is not empty on first run.

---

## 10. Environment Variables Reference

| Variable                | Required | Default                  | Description                                                                             |
| ----------------------- | -------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `JWT_SECRET`            | Yes      | —                        | HMAC-SHA256 signing secret (min 32 chars)                                               |
| `POSTGRES_USER`         | No       | `taskflow`               | PostgreSQL username                                                                     |
| `POSTGRES_PASSWORD`     | No       | `taskflow`               | PostgreSQL password                                                                     |
| `POSTGRES_DB`           | No       | `taskflow`               | PostgreSQL database name                                                                |
| `POSTGRES_PORT`         | No       | `5432`                   | Host port for PostgreSQL                                                                |
| `API_PORT`              | No       | `4000`                   | Backend server port                                                                     |
| `VITE_API_URL`          | No       | `http://localhost:4000`  | API base URL used by the frontend                                                       |
| `FRONTEND_URL`          | No       | `http://localhost:5173`  | Where OAuth2 redirects after Google login                                               |
| `GOOGLE_CLIENT_ID`      | No       | —                        | Google OAuth2 client ID (Sign in with Google)                                           |
| `GOOGLE_CLIENT_SECRET`  | No       | —                        | Google OAuth2 client secret                                                             |
| `MAIL_ENABLED`          | No       | `false`                  | Set `true` to activate hourly email digest                                              |
| `MAIL_FROM`             | No       | `noreply@taskflow.local` | Sender address for digest emails                                                        |
| `MAIL_HOST`             | No       | `localhost`              | SMTP host                                                                               |
| `MAIL_PORT`             | No       | `1025`                   | SMTP port                                                                               |
| `MAIL_USERNAME`         | No       | —                        | SMTP authentication username                                                            |
| `MAIL_PASSWORD`         | No       | —                        | SMTP authentication password                                                            |
| `MINIO_USER`            | No       | `taskflow`               | MinIO root username (access key)                                                        |
| `MINIO_PASSWORD`        | No       | `taskflow123`            | MinIO root password (secret key)                                                        |
| `MINIO_ENDPOINT`        | No       | `http://minio:9000`      | MinIO endpoint used by the backend (internal Docker hostname)                           |
| `MINIO_PUBLIC_ENDPOINT` | No       | `http://localhost:9002`  | MinIO endpoint reachable from the host (not used for downloads — API proxies all files) |
| `MINIO_BUCKET`          | No       | `taskflow`               | Object storage bucket name                                                              |
| `MINIO_PORT`            | No       | `9002`                   | Host port for MinIO API                                                                 |
| `MINIO_CONSOLE_PORT`    | No       | `9003`                   | Host port for MinIO web console                                                         |

---

## 10. Extended Features

This section documents features added beyond the original MVP scope, implementing JIRA-parity functionality for the hackathon demo.

---

### 10.1 Story Points

**Why it matters:** Sprint planning has no capacity concept without it. Judges expect to see "points" next to tasks and a sprint velocity metric on the dashboard.

---

#### Database

**Migration: `V15__story_points.sql`**

```sql
ALTER TABLE tasks ADD COLUMN story_points integer;
```

- Column is nullable — existing tasks carry `NULL` (displayed as `—` in the UI)
- No `CHECK` constraint in the DB; range enforcement (0–100) is done in the frontend input element

---

#### Backend Changes

**`entity/Task.java`**

Added field after `position`:

```java
@Column(name = "story_points")
private Integer storyPoints;
```

Lombok `@Getter`/`@Setter` generates accessors automatically.

---

**`dto/TaskDto.java`**

Added `Integer storyPoints` as the last field in the record definition, and mapped it in the `from(Task t)` factory:

```java
public record TaskDto(
    // ... existing fields ...
    Integer storyPoints
) {
    public static TaskDto from(Task t) {
        return new TaskDto(
            // ... existing mappings ...
            t.getStoryPoints()
        );
    }
}
```

---

**`controller/TaskController.java`**

`@Transactional` is applied at the class level (fixes `LazyInitializationException` on `labels` ManyToMany).

`storyPoints` accepted in both inner request records:

```java
record CreateTaskRequest(
    String title, String description, String status, String priority,
    String type, String assigneeId, String sprintId, String parentId,
    String dueDate, Integer storyPoints
) {}

record UpdateTaskRequest(
    String title, String description, String status, String priority,
    String type, String assigneeId, String sprintId, String dueDate,
    Integer storyPoints
) {}
```

Set on the entity in both `createTask` and `updateTask` handlers:

```java
task.setStoryPoints(req.storyPoints());
```

`isValidStatus()` was also extended to accept the two missing statuses:

```java
private boolean isValidStatus(String s) {
    return s != null && List.of(
        "todo", "in_progress", "blocked", "in_review", "done"
    ).contains(s);
}
```

---

#### Frontend Changes

**`types.ts`**

```typescript
type Task = {
  // ... existing fields ...
  story_points: number | null;
};
```

---

**`components/TaskModal.tsx`**

State:

```tsx
const [storyPoints, setStoryPoints] = useState<string>(
  task?.story_points != null ? String(task.story_points) : "",
);
```

Form field (rendered in the 2-column grid alongside Priority):

```tsx
<Field label="Story points">
  <input
    className={cx.fieldInput}
    type="number"
    min={0}
    max={100}
    step={1}
    value={storyPoints}
    onChange={(e) => setStoryPoints(e.target.value)}
    placeholder="—"
  />
</Field>
```

Included in the submit body:

```tsx
story_points: storyPoints !== "" ? Number(storyPoints) : null,
```

---

**`components/TaskCard.tsx`**

Small muted pill rendered after the priority badge:

```tsx
{
  task.story_points != null && (
    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
      {task.story_points} pts
    </span>
  );
}
```

---

**`pages/ProjectDetailPage.tsx`**

Inline display on task rows in the list view:

```tsx
{
  task.story_points != null && (
    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
      ({task.story_points} pts)
    </span>
  );
}
```

---

**`pages/DashboardPage.tsx`**

Sprint velocity stat card — computed client-side:

```tsx
const activeSprint = sprints.find((s) => s.status === "active");
const sprintVelocity = activeSprint
  ? tasks
      .filter(
        (t) =>
          t.sprint_id === activeSprint.id &&
          t.status === "done" &&
          t.story_points != null,
      )
      .reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  : 0;
```

Rendered as:

```tsx
<StatCard
  label="Sprint velocity (pts)"
  value={sprintVelocity}
  color="var(--brand)"
/>
```
