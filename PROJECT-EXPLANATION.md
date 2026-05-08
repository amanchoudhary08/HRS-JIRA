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

---

## 1. Project Overview

**Taskflow** (branded internally as HRS-JIRA) is a lightweight project management tool modelled after JIRA. Users can:

- Register and log in with JWT-based authentication
- Create and manage **projects**
- Create, update, delete, and filter **tasks** within each project
- View tasks in a **Kanban board** (Todo / In Progress / Done columns) with drag-and-drop
- Receive **real-time task updates** via Server-Sent Events (SSE) — no manual refresh needed
- Toggle **dark / light mode**
- View **project statistics** (tasks by status, tasks by assignee)

---

## 2. Tech Stack

| Layer              | Technology                                       |
| ------------------ | ------------------------------------------------ |
| Backend language   | Java 17                                          |
| Backend framework  | Spring Boot 3.5.0                                |
| ORM                | Spring Data JPA (Hibernate)                      |
| Database           | PostgreSQL (via Docker)                          |
| Migrations         | Flyway                                           |
| Authentication     | JWT (JJWT 0.12.6, HMAC-SHA256)                   |
| Real-time          | Server-Sent Events (SSE)                         |
| Frontend language  | TypeScript                                       |
| Frontend framework | React 18                                         |
| Build tool         | Vite                                             |
| Routing            | React Router v6                                  |
| Drag-and-drop      | @dnd-kit/core + @dnd-kit/sortable                |
| Styling            | Plain CSS with CSS custom properties (variables) |
| Containerization   | Docker + Docker Compose                          |

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
│          comments,          │
│          activity_events    │
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
-- Custom enum types
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
| `status` | `TaskStatus` (enum) | todo / in_progress / done; default = todo |
| `priority` | `TaskPriority` (enum) | low / medium / high; default = medium |
| `type` | `String` | task / bug / story / epic; default = task |
| `project` | `Project` | ManyToOne, lazy |
| `assignee` | `User` | ManyToOne, lazy, nullable |
| `createdBy` | `User` | ManyToOne, lazy |
| `parent` | `Task` | Self-referencing ManyToOne, nullable (subtask parent) |
| `sprint` | `Sprint` | ManyToOne, lazy, nullable — which sprint this task belongs to |
| `position` | `int` | Display order within sprint/column; default = 0 |
| `dueDate` | `LocalDate` | **Required**; must not be in the past |
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

### 4.2 DTOs

Data Transfer Objects define what the API returns (never raw entities).

| DTO                | Fields                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserDto`          | `id`, `name`, `email`                                                                                                                                                                              |
| `ProjectDto`       | `id`, `name`, `description`, `ownerId`, `createdAt`, `members` (optional — omitted when null)                                                                                                      |
| `ProjectMemberDto` | `projectId`, `userId`, `userName`, `userEmail`, `role`, `joinedAt`                                                                                                                                 |
| `TaskDto`          | `id`, `title`, `description`, `status`, `priority`, `type`, `projectId`, `assigneeId`, `createdBy`, `parentId`, `sprintId`, `position`, `dueDate`, `createdAt`, `updatedAt`                        |
| `SprintDto`        | `id`, `projectId`, `name`, `goal`, `startDate`, `endDate`, `status`, `createdAt`                                                                                                                   |
| `ActivityEventDto` | `id`, `projectId`, `taskId`, `actorId`, `actorName`, `type`, `payload` (`Map<String,Object>`), `createdAt` — built from in-memory values (no lazy re-fetch) to avoid `LazyInitializationException` |

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

#### `ActivityEventRepository`

- `findByProjectIdOrderByCreatedAtDesc(UUID projectId, Pageable)` — Project-level activity feed, newest-first; JOIN FETCH actor
- `findByTaskIdOrderByCreatedAtDesc(UUID taskId)` — Task-scoped activity feed; JOIN FETCH actor

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
- `status` — One of: `todo`, `in_progress`, `done`
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

### 4.5 Security — JWT Auth

**`JwtUtil`**

- Algorithm: HMAC-SHA256
- Secret: 32-byte key derived from `JWT_SECRET` environment variable
- Expiry: 24 hours
- Claims stored in token: `user_id`, `email`, `iat`, `exp`

**`JwtAuthFilter`** (extends `OncePerRequestFilter`)

- Reads the `Authorization: Bearer <token>` header
- Validates signature and expiry
- Loads the `User` from the database
- Sets `UsernamePasswordAuthenticationToken` into `SecurityContextHolder`
- Silent on invalid/missing tokens (downstream endpoint decides if auth is required)

**`SecurityConfig`**

- CSRF disabled (stateless REST API)
- CORS: allows all origins, methods `GET/POST/PATCH/DELETE/OPTIONS`, headers `Authorization` and `Content-Type`
- Session management: `STATELESS`
- Public routes: `POST /auth/register`, `POST /auth/login`, `OPTIONS /**`, `GET /healthz`
- All other routes require a valid JWT

---

### 4.6 Real-Time Events — SSE

**`SseEvent`** — Java record: `(String type, Object data)`

**`EventBroker`** — Spring `@Component` singleton

- Maintains a `ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>>` — maps project IDs to their list of active SSE clients
- `subscribe(UUID projectId)` — Creates an `SseEmitter`, registers it, sets up cleanup callbacks (complete / timeout / error)
- `publish(UUID projectId, SseEvent event)` — Iterates all emitters for the project and sends the event as JSON
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
| `comment_deleted` | `DELETE /comments/{id}` | `{ id, task_id }` |
| `activity_created` | Any mutating operation in any controller | Full `ActivityEventDto` |
| `member_added` | `POST /members` | `{ userName, role }` |
| `member_removed` | `DELETE /members/{userId}` | `{ userName }` |
| `role_changed` | `PATCH /members/{userId}` | `{ userName, role }` |

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

**V4\_\_emp_id.sql** — Employee ID column additions

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

server:
  port: 4000

app:
  jwt:
    secret: ${JWT_SECRET} # Must be set via environment
    expiration-hours: 24
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
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  type: "task" | "bug" | "story" | "epic";
  project_id: string;
  assignee_id: string | null;
  created_by: string;
  parent_id: string | null;
  sprint_id: string | null;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } }
  | { type: "task_moved"; data: Task }
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
  by_status: { todo: number; in_progress: number; done: number };
  by_assignee: { assignee_id: string; name: string; count: number }[];
  by_type: { type: string; count: number }[];
  by_sprint: { sprint: string; count: number }[];
  daily_done: { date: string; count: number }[];
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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

**Tab bar:** `Tasks | Members` — switches between the kanban view and the membership panel

**Members tab:**

- Lists all project members with avatar initials, name, email, and role badge (gold = owner, blue = admin, grey = member, light grey = viewer)
- Project owner and admins see an **Invite member** button that opens `InviteMemberModal`
- Project owner can change any non-owner member's role via an inline dropdown, or remove them

**Filter toolbar (Tasks tab):**

- Status filter dropdown: All / Todo / In Progress / Done
- Assignee filter dropdown: All + list of all users (fetched from `GET /users`)
- Filters are applied together (both can be active simultaneously)
- Changing filters resets to page 1

**Kanban Board (3 columns):**

- Columns: **Todo** | **In Progress** | **Done**
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
- **Nav bar**: Brand logo (links to `/projects`), logged-in user's name, dark/light toggle button, Logout button
- Dark/light toggle uses `useDarkMode` hook
- Logout calls `logout()` from auth context

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

#### `TaskCard` (`src/components/TaskCard.tsx`)

- Reusable draggable task card used on the Kanban board (`BoardPage`)
- Layout matches the Tasks tab design exactly:
  - `TypeIcon` + short task ID (`#8b01b617` monospace) + task title (h3)
  - Description or "No description." in muted text
  - Priority pill (color-coded) + assignee name pill in a flex row
  - Due date text (red if overdue)
  - Optional inline status dropdown via `onStatusChange` prop — changes status directly without opening the modal
- Accepts a `dragging` boolean prop — shows 0.4 opacity and `grabbing` cursor while being dragged
- Accepts a `ref` for `@dnd-kit` sortable integration
- `onClick` opens the full `TaskModal` for the task

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
labelStatus("done"); // → "Done"
```

Used to convert raw status enum values to human-readable labels in the UI.

---

### 5.8 Styling

`src/main.css` — Single global stylesheet using CSS custom properties.

**Color tokens (light mode defaults):**

| Variable         | Value                 | Usage                        |
| ---------------- | --------------------- | ---------------------------- |
| `--bg`           | `#f6f7f3`             | Page background              |
| `--bg-card`      | `#ffffff`             | Card/modal background        |
| `--text`         | `#1e2623`             | Primary text                 |
| `--text-muted`   | `#65706b`             | Secondary / description text |
| `--brand`        | `#1f5b45`             | Primary brand color (teal)   |
| `--border`       | `#dfe4dc`             | Card borders                 |
| `--border-input` | `#cdd5cf`             | Input field borders          |
| `--pill-bg`      | `#e8efe7`             | Badge backgrounds            |
| `--error-border` | `#b42318`             | Error state borders          |
| `--shadow`       | `rgba(35,51,45,0.08)` | Card drop shadows            |

**Dark mode** (activated by `.dark` class on `<html>`):\*\*

- All variables are overridden with higher-contrast dark equivalents
- Brand color lightens to `#5bbf94` for visibility

**Notable CSS classes:**

| Class                             | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `.button`                         | Primary CTA button (brand background)                                    |
| `.button.secondary`               | Outlined secondary button                                                |
| `.button.danger`                  | Red destructive button                                                   |
| `.card`                           | Bordered card container with shadow                                      |
| `.grid`                           | Auto-fit CSS Grid for project cards                                      |
| `.field`                          | Vertical label + input stack                                             |
| `.pill`                           | Small rounded badge                                                      |
| `.priority-high/medium/low`       | Priority-specific pill colors                                            |
| `.column`                         | Kanban column; highlights on drag-over                                   |
| `.task-card`                      | Draggable task card — `grab` cursor; buttons inside get `pointer`        |
| `.type-icon`                      | Type icon wrapper — `pointer` cursor + instant CSS tooltip via `::after` |
| `.error`                          | Red left-bordered error message                                          |
| `.modal-backdrop` / `.modal`      | Modal overlay and content box                                            |
| `.live-badge` / `.live-badge--on` | SSE connection status indicator                                          |
| `.pagination`                     | Prev/Next navigation controls                                            |
| `.auth` / `.auth-panel`           | Auth page two-panel layout                                               |
| `.toolbar`                        | Flex row with space-between for page headers                             |
| `.stack`                          | Vertical flex gap (14px)                                                 |
| `.tab-bar` / `.tab-btn`           | Horizontal tab strip; active tab has brand underline                     |
| `.tab-btn--active`                | Active state for tab button                                              |
| `.member-avatar`                  | Circular avatar showing name initials                                    |
| `.member-avatar--sm`              | Smaller avatar variant used in stacked project card list                 |
| `.member-avatar--overflow`        | `+N` overflow count bubble                                               |
| `.avatar-stack`                   | Overlapping row of member avatars on project cards                       |
| `.member-list` / `.member-row`    | Member list container and individual row                                 |
| `.member-info`                    | Name + email column inside a member row                                  |

---

## 6. Feature Map — Frontend ↔ Backend Coverage

| Feature                          | Frontend                                                                | Backend                                                        |
| -------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| User registration                | `AuthPage` (register mode)                                              | `POST /auth/register`                                          |
| User login                       | `AuthPage` (login mode)                                                 | `POST /auth/login`                                             |
| JWT storage & reuse              | `AuthContext`, `localStorage`                                           | `JwtUtil`, `JwtAuthFilter`                                     |
| Logout                           | `Layout` nav bar                                                        | (stateless, client-side only)                                  |
| List projects                    | `ProjectsPage`                                                          | `GET /projects`                                                |
| Create project                   | `ProjectsPage` form                                                     | `POST /projects`                                               |
| View project detail              | `ProjectDetailPage`                                                     | `GET /projects/{id}`                                           |
| Edit project                     | `ProjectDetailPage` edit form                                           | `PATCH /projects/{id}`                                         |
| Delete project                   | `ProjectDetailPage` delete button                                       | `DELETE /projects/{id}`                                        |
| Project stats / Dashboard        | `DashboardPage` at `/projects/:id/dashboard` — stat cards + 5 recharts  | `GET /projects/{id}/stats`                                     |
| List tasks (with filters)        | `ProjectDetailPage` filter toolbar                                      | `GET /projects/{id}/tasks?status=&assignee=`                   |
| Create task                      | `TaskModal` (create) — due date **required**                            | `POST /projects/{id}/tasks`                                    |
| Edit task                        | `TaskModal` (edit) — due date **required**                              | `PATCH /projects/{id}/tasks/{taskId}`                          |
| Delete task                      | Task card delete button                                                 | `DELETE /projects/{id}/tasks/{taskId}`                         |
| Change task status inline        | Task card status dropdown                                               | `PATCH /projects/{id}/tasks/{taskId}`                          |
| Drag-and-drop status change      | Kanban column DnD (both `ProjectDetailPage` + `BoardPage`)              | `PATCH /projects/{id}/tasks/{taskId}/position`                 |
| Real-time task updates           | `useProjectEvents` + SSE hook                                           | `SseController` + `EventBroker`                                |
| List all users (assignee)        | `TaskModal` assignee dropdown                                           | `GET /users`                                                   |
| Pagination                       | `ProjectsPage`, `ProjectDetailPage`                                     | `?page=&limit=` on all list endpoints                          |
| Dark mode                        | `useDarkMode` hook + `Layout` toggle                                    | — (client-side only)                                           |
| Health check                     | —                                                                       | `GET /healthz`                                                 |
| List project members             | `MemberList` in Members tab                                             | `GET /projects/{id}/members`                                   |
| Invite project member            | `InviteMemberModal`                                                     | `POST /projects/{id}/members`                                  |
| Change member role               | Inline role dropdown in `MemberList`                                    | `PATCH /projects/{id}/members/{userId}`                        |
| Remove member                    | Remove button in `MemberList`                                           | `DELETE /projects/{id}/members/{userId}`                       |
| Member avatars on cards          | `MemberAvatars` in `ProjectsPage`                                       | Members included in `GET /projects` response                   |
| Task types (Task/Bug/Story/Epic) | `TypeIcon` component + type selector in `TaskModal`                     | `type` field on `Task` entity/DTO                              |
| Subtasks                         | Subtask list + add form in `TaskModal`; parent breadcrumb               | `GET /projects/{id}/tasks/{taskId}/subtasks`                   |
| Task comments                    | Comments section in `TaskModal`, live via SSE                           | `GET/POST/PATCH/DELETE /projects/{id}/tasks/{taskId}/comments` |
| Activity log (project feed)      | Activity tab in `ProjectDetailPage`, `ActivityFeed` component           | `GET /projects/{id}/activity`                                  |
| Activity log (task feed)         | Activity section in `TaskModal`, live via SSE `activity_created`        | `GET /projects/{id}/tasks/{taskId}/activity`                   |
| Specific activity per field      | `ActivityFeed` — field-specific messages with from/to values            | Per-field conditional logs in `TaskController.updateTask()`    |
| Subtask creation → parent feed   | Parent task's Activity section shows `subtask_created` event            | `ActivityService.log()` called against parent task after save  |
| Due date validation              | `min` attr + submit guard in `TaskModal` — **mandatory**                | Server-side date parse validation                              |
| Click task card to open          | `onClick` on `<article>` in `ProjectDetailPage`                         | —                                                              |
| Sprints (CRUD)                   | `BoardPage` sprint panel + `CreateSprintModal`                          | `GET/POST/PATCH/DELETE /projects/{id}/sprints`                 |
| Sprint date validation           | `min` attr + submit guard — start **≥ today**, end **≥ start**          | — (frontend only)                                              |
| Sprint task assignment           | Backlog "+ Add to sprint" button in `BoardPage`                         | `POST/DELETE /projects/{id}/sprints/{sprintId}/tasks/{taskId}` |
| Sprint start / complete          | Start / Complete buttons in `BoardPage`                                 | `PATCH /projects/{id}/sprints/{sprintId}` with `status`        |
| Kanban board (full)              | `BoardPage` at `/projects/:id/board`                                    | `PATCH /projects/{id}/tasks/{taskId}/position`                 |
| Drag-and-drop between columns    | `@dnd-kit` in `BoardPage`                                               | `PATCH /projects/{id}/tasks/{taskId}/position`                 |
| Real-time sprint/board events    | `useProjectEvents` — `task_moved`, `sprint_started`, `sprint_completed` | `EventBroker`                                                  |

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

| Service    | Image                            | Port      | Notes                                                         |
| ---------- | -------------------------------- | --------- | ------------------------------------------------------------- |
| `db`       | `postgres:16`                    | 5432      | Volume-persisted, Flyway migrations auto-run on backend start |
| `backend`  | Built from `backend/Dockerfile`  | 4000      | Requires `JWT_SECRET` env var                                 |
| `frontend` | Built from `frontend/Dockerfile` | 5173 / 80 | Nginx serves the Vite build                                   |

**To run the full stack:**

```bash
docker-compose up --build
```

**Backend Dockerfile:** Multi-stage — Maven build → slim JRE runtime image.

**Frontend Dockerfile:** Multi-stage — Node/Vite build → Nginx serve static files. `nginx.conf` handles SPA routing (all paths serve `index.html`).

---

## 9. Seed Data (Test Credentials)

After running migrations, two users are available immediately:

| Name         | Email              | Password      |
| ------------ | ------------------ | ------------- |
| Test User    | `test@example.com` | `password123` |
| Alex Johnson | `alex@example.com` | `password123` |

The auth page pre-fills `test@example.com` / `password123` to make demo login instant.

One project ("Website Redesign") and three sample tasks are seeded so the app is not empty on first run.
