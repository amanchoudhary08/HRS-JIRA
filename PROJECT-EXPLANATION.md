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
│          tasks,             │
│          project_members    │
└─────────────────────────────┘
```

---

## 4. Backend — Spring Boot

The backend lives in `backend/src/main/java/com/taskflow/`.

### 4.1 Entities & Database Schema

Three core JPA entities map 1:1 to PostgreSQL tables.

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
  project_id  uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_by  uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
| `project` | `Project` | ManyToOne, lazy |
| `assignee` | `User` | ManyToOne, lazy, nullable |
| `createdBy` | `User` | ManyToOne, lazy |
| `dueDate` | `LocalDate` | Optional |
| `createdAt` | `OffsetDateTime` | Auto on insert |
| `updatedAt` | `OffsetDateTime` | Auto on update |

**Database indices:**

- `idx_projects_owner_id` → `projects(owner_id)`
- `idx_tasks_project_id` → `tasks(project_id)`
- `idx_tasks_assignee_id` → `tasks(assignee_id)`
- `idx_tasks_created_by` → `tasks(created_by)`
- `idx_tasks_status` → `tasks(status)`

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

### 4.2 DTOs

Data Transfer Objects define what the API returns (never raw entities).

| DTO                | Fields                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `UserDto`          | `id`, `name`, `email`                                                                                                           |
| `ProjectDto`       | `id`, `name`, `description`, `ownerId`, `createdAt`, `members` (optional — omitted when null)                                   |
| `ProjectMemberDto` | `projectId`, `userId`, `userName`, `userEmail`, `role`, `joinedAt`                                                              |
| `TaskDto`          | `id`, `title`, `description`, `status`, `priority`, `projectId`, `assigneeId`, `createdBy`, `dueDate`, `createdAt`, `updatedAt` |

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

| Method   | Path                   | Auth       | Request/Params            | Response                                                                     |
| -------- | ---------------------- | ---------- | ------------------------- | ---------------------------------------------------------------------------- |
| `GET`    | `/projects`            | Required   | `?page=1&limit=20`        | `200 { projects[], page, limit, total }` (each project includes `members[]`) |
| `POST`   | `/projects`            | Required   | `{ name, description? }`  | `201 ProjectDto` (also seeds owner into `project_members`)                   |
| `GET`    | `/projects/{id}`       | Required   | —                         | `200 { ...ProjectDto, tasks[], members[] }`                                  |
| `PATCH`  | `/projects/{id}`       | Owner only | `{ name?, description? }` | `200 ProjectDto`                                                             |
| `DELETE` | `/projects/{id}`       | Owner only | —                         | `204 No Content`                                                             |
| `GET`    | `/projects/{id}/stats` | Required   | —                         | `200 { by_status[], by_assignee[] }`                                         |

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

| Method   | Path                            | Auth                   | Request/Params                                                        | Response                              |
| -------- | ------------------------------- | ---------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `GET`    | `/projects/{id}/tasks`          | Required               | `?status=&assignee=&page=1&limit=20`                                  | `200 { tasks[], page, limit, total }` |
| `POST`   | `/projects/{id}/tasks`          | Required               | `{ title, description?, status?, priority?, assigneeId?, dueDate? }`  | `201 TaskDto`                         |
| `PATCH`  | `/projects/{id}/tasks/{taskId}` | Owner/creator/assignee | `{ title?, description?, status?, priority?, assigneeId?, dueDate? }` | `200 TaskDto`                         |
| `DELETE` | `/projects/{id}/tasks/{taskId}` | Owner or creator       | —                                                                     | `204 No Content`                      |

**Validation:**

- `title` — Required on creation
- `status` — One of: `todo`, `in_progress`, `done`
- `priority` — One of: `low`, `medium`, `high`
- `dueDate` — ISO format `YYYY-MM-DD`
- `assigneeId` — Valid UUID referencing an existing user

**SSE side effects:** Every `POST`, `PATCH`, and `DELETE` on a task triggers an SSE broadcast (`task_created`, `task_updated`, or `task_deleted`) to all clients subscribed to that project.

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

type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } };

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

| URL             | Component                    | Auth      |
| --------------- | ---------------------------- | --------- |
| `/`             | Redirect to `/projects`      | —         |
| `/login`        | `AuthPage` (mode="login")    | Public    |
| `/register`     | `AuthPage` (mode="register") | Public    |
| `/projects`     | `ProjectsPage`               | Protected |
| `/projects/:id` | `ProjectDetailPage`          | Protected |

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

- Modal dialog for creating or editing a task
- **Create mode**: all fields empty (except defaults)
- **Edit mode**: pre-filled with existing task data
- **Fields**: title (required), description, status, priority, assignee (dropdown of all users), due date (date picker)
- On save: calls `POST` (create) or `PATCH` (edit) and closes modal
- Displays API errors inline
- Closes on Cancel button or successful save

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
    // Handle incoming real-time event
  },
);
```

- Creates a native `EventSource` to `GET /projects/{id}/events?token=JWT`
- Listens for named events: `task_created`, `task_updated`, `task_deleted`
- Parses JSON payloads and calls the provided callback
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

| Class                             | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `.button`                         | Primary CTA button (brand background)                    |
| `.button.secondary`               | Outlined secondary button                                |
| `.button.danger`                  | Red destructive button                                   |
| `.card`                           | Bordered card container with shadow                      |
| `.grid`                           | Auto-fit CSS Grid for project cards                      |
| `.field`                          | Vertical label + input stack                             |
| `.pill`                           | Small rounded badge                                      |
| `.priority-high/medium/low`       | Priority-specific pill colors                            |
| `.column`                         | Kanban column; highlights on drag-over                   |
| `.task-card`                      | Draggable task card                                      |
| `.error`                          | Red left-bordered error message                          |
| `.modal-backdrop` / `.modal`      | Modal overlay and content box                            |
| `.live-badge` / `.live-badge--on` | SSE connection status indicator                          |
| `.pagination`                     | Prev/Next navigation controls                            |
| `.auth` / `.auth-panel`           | Auth page two-panel layout                               |
| `.toolbar`                        | Flex row with space-between for page headers             |
| `.stack`                          | Vertical flex gap (14px)                                 |
| `.tab-bar` / `.tab-btn`           | Horizontal tab strip; active tab has brand underline     |
| `.tab-btn--active`                | Active state for tab button                              |
| `.member-avatar`                  | Circular avatar showing name initials                    |
| `.member-avatar--sm`              | Smaller avatar variant used in stacked project card list |
| `.member-avatar--overflow`        | `+N` overflow count bubble                               |
| `.avatar-stack`                   | Overlapping row of member avatars on project cards       |
| `.member-list` / `.member-row`    | Member list container and individual row                 |
| `.member-info`                    | Name + email column inside a member row                  |

---

## 6. Feature Map — Frontend ↔ Backend Coverage

| Feature                     | Frontend                                | Backend                                      |
| --------------------------- | --------------------------------------- | -------------------------------------------- |
| User registration           | `AuthPage` (register mode)              | `POST /auth/register`                        |
| User login                  | `AuthPage` (login mode)                 | `POST /auth/login`                           |
| JWT storage & reuse         | `AuthContext`, `localStorage`           | `JwtUtil`, `JwtAuthFilter`                   |
| Logout                      | `Layout` nav bar                        | (stateless, client-side only)                |
| List projects               | `ProjectsPage`                          | `GET /projects`                              |
| Create project              | `ProjectsPage` form                     | `POST /projects`                             |
| View project detail         | `ProjectDetailPage`                     | `GET /projects/{id}`                         |
| Edit project                | `ProjectDetailPage` edit form           | `PATCH /projects/{id}`                       |
| Delete project              | `ProjectDetailPage` delete button       | `DELETE /projects/{id}`                      |
| Project stats               | — (endpoint exists, not used in UI yet) | `GET /projects/{id}/stats`                   |
| List tasks (with filters)   | `ProjectDetailPage` filter toolbar      | `GET /projects/{id}/tasks?status=&assignee=` |
| Create task                 | `TaskModal` (create)                    | `POST /projects/{id}/tasks`                  |
| Edit task                   | `TaskModal` (edit)                      | `PATCH /projects/{id}/tasks/{taskId}`        |
| Delete task                 | Task card delete button                 | `DELETE /projects/{id}/tasks/{taskId}`       |
| Change task status inline   | Task card status dropdown               | `PATCH /projects/{id}/tasks/{taskId}`        |
| Drag-and-drop status change | Kanban column DnD                       | `PATCH /projects/{id}/tasks/{taskId}`        |
| Real-time task updates      | `useProjectEvents` + SSE hook           | `SseController` + `EventBroker`              |
| List all users (assignee)   | `TaskModal` assignee dropdown           | `GET /users`                                 |
| Pagination                  | `ProjectsPage`, `ProjectDetailPage`     | `?page=&limit=` on all list endpoints        |
| Dark mode                   | `useDarkMode` hook + `Layout` toggle    | — (client-side only)                         |
| Health check                | —                                       | `GET /healthz`                               |
| List project members        | `MemberList` in Members tab             | `GET /projects/{id}/members`                 |
| Invite project member       | `InviteMemberModal`                     | `POST /projects/{id}/members`                |
| Change member role          | Inline role dropdown in `MemberList`    | `PATCH /projects/{id}/members/{userId}`      |
| Remove member               | Remove button in `MemberList`           | `DELETE /projects/{id}/members/{userId}`     |
| Member avatars on cards     | `MemberAvatars` in `ProjectsPage`       | Members included in `GET /projects` response |

> **Note:** The `GET /projects/{id}/stats` endpoint is implemented in the backend but not yet wired to any frontend UI component. It returns task counts grouped by status and by assignee — suitable for a future dashboard or chart view.

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
