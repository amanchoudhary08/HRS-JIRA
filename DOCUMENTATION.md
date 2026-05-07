# TaskFlow — Full Project Documentation

> A full-stack project management and task-tracking web application.  
> Stack: **Go (stdlib net/http)** · **PostgreSQL** · **React 18 + TypeScript** · **Vite** · **Docker Compose**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Repository Layout](#3-repository-layout)
4. [Infrastructure & Docker](#4-infrastructure--docker)
   - 4.1 [docker-compose.yml](#41-docker-composeyml)
   - 4.2 [Backend Dockerfile](#42-backend-dockerfile)
   - 4.3 [Frontend Dockerfile](#43-frontend-dockerfile)
5. [Database Layer](#5-database-layer)
   - 5.1 [Schema (migration 1)](#51-schema-migration-1)
   - 5.2 [Seed Data (migration 2)](#52-seed-data-migration-2)
   - 5.3 [Entity Relationships](#53-entity-relationships)
6. [Backend — Go API](#6-backend--go-api)
   - 6.1 [Module & Dependencies](#61-module--dependencies)
   - 6.2 [main.go — Entry Point](#62-maingo--entry-point)
   - 6.3 [models.go — Domain Types](#63-modelsgo--domain-types)
   - 6.4 [middleware.go — HTTP Middleware](#64-middlewareg--http-middleware)
   - 6.5 [handlers_auth.go — Authentication Handlers](#65-handlers_authgo--authentication-handlers)
   - 6.6 [handlers_projects.go — Project Handlers](#66-handlers_projectsgo--project-handlers)
   - 6.7 [handlers_tasks.go — Task Handlers](#67-handlers_tasksgo--task-handlers)
   - 6.8 [handlers_sse.go — Server-Sent Events Handler](#68-handlers_ssego--server-sent-events-handler)
   - 6.9 [broker.go — SSE Event Broker](#69-brokergo--sse-event-broker)
   - 6.10 [db.go — Database Helper Queries](#610-dbgo--database-helper-queries)
   - 6.11 [helpers.go — Utility Functions](#611-helpersgo--utility-functions)
   - 6.12 [main_test.go — Integration Tests](#612-main_testgo--integration-tests)
   - 6.13 [Full API Route Table](#613-full-api-route-table)
   - 6.14 [Authentication Flow](#614-authentication-flow)
   - 6.15 [Authorization Rules](#615-authorization-rules)
7. [Frontend — React + TypeScript](#7-frontend--react--typescript)
   - 7.1 [Tech Stack & Build](#71-tech-stack--build)
   - 7.2 [index.html](#72-indexhtml)
   - 7.3 [App.tsx — Root Component & Routing](#73-apptsx--root-component--routing)
   - 7.4 [main.css — Global Styles & Design Tokens](#74-maincss--global-styles--design-tokens)
   - 7.5 [types.ts — Shared TypeScript Types](#75-typests--shared-typescript-types)
   - 7.6 [api/client.ts — HTTP Client](#76-apiclientts--http-client)
   - 7.7 [context/AuthContext.tsx — Auth State](#77-contextauthcontexttsx--auth-state)
   - 7.8 [hooks/useDarkMode.ts](#78-hooksusedarkmodets)
   - 7.9 [hooks/useProjectEvents.ts — SSE Hook](#79-hooksuseprojecteventsts--sse-hook)
   - 7.10 [components/Layout.tsx — Shell Layout](#710-componentslayouttsx--shell-layout)
   - 7.11 [components/Protected.tsx — Route Guard](#711-componentsprotectedtsx--route-guard)
   - 7.12 [components/Field.tsx — Form Field Wrapper](#712-componentsfieldtsx--form-field-wrapper)
   - 7.13 [components/icons.tsx — SVG Icons](#713-componentsiconststsx--svg-icons)
   - 7.14 [components/TaskModal.tsx — Task Create/Edit Modal](#714-componentstaskmodaltsx--task-createedit-modal)
   - 7.15 [pages/AuthPage.tsx — Login & Register](#715-pagesauthpagetsx--login--register)
   - 7.16 [pages/ProjectsPage.tsx — Projects List](#716-pagesprojectspagetsx--projects-list)
   - 7.17 [pages/ProjectDetailPage.tsx — Kanban Board](#717-pagesprojectdetailpagetsx--kanban-board)
   - 7.18 [utils/labelStatus.ts](#718-utilslabelstatuss)
8. [Data Flow Walkthrough](#8-data-flow-walkthrough)
   - 8.1 [Login](#81-login)
   - 8.2 [Create a Task](#82-create-a-task)
   - 8.3 [Real-Time SSE Update](#83-real-time-sse-update)
   - 8.4 [Drag-and-Drop Status Change](#84-drag-and-drop-status-change)
9. [Security Design](#9-security-design)
10. [Running the Project](#10-running-the-project)

---

## 1. Project Overview

TaskFlow is a collaborative project and task management tool. Users can:

- Register and log in with email/password (bcrypt hashed, JWT sessions).
- Create **projects** and invite collaboration implicitly by assigning tasks.
- Within each project, create **tasks** with title, description, status (`todo` / `in_progress` / `done`), priority (`low` / `medium` / `high`), assignee, and due date.
- View tasks in a **Kanban-style board** grouped by status, and **drag tasks** between columns for quick status changes.
- Filter tasks by status and assignee.
- Receive **real-time updates** from other users via Server-Sent Events (SSE) — no polling, no WebSockets.
- Toggle **dark mode**, which persists across sessions via localStorage.
- Paginate both project and task lists.

---

## 2. Architecture Diagram

```
Browser (React SPA)
       │
       │  REST JSON (HTTP/HTTPS)
       │  SSE stream for real-time events
       ▼
  ┌─────────┐
  │  nginx  │  (serves built React files, port 3000 in Docker)
  └────┬────┘
       │ (no proxy — frontend calls API directly)
       │
  ┌────▼────────────────────────┐
  │   Go API Server (port 4000) │
  │  ┌──────────────────────┐   │
  │  │  CORS middleware     │   │
  │  │  Logging middleware  │   │
  │  │  JWT auth middleware │   │
  │  │  HTTP ServeMux       │   │
  │  └──────────────────────┘   │
  │  ┌──────────────────────┐   │
  │  │   eventBroker (SSE)  │   │
  │  └──────────────────────┘   │
  └────────────┬────────────────┘
               │ database/sql
               ▼
  ┌────────────────────────────┐
  │  PostgreSQL 16             │
  │  tables: users, projects,  │
  │          tasks             │
  │  goose migrations          │
  └────────────────────────────┘
```

- The **frontend** is a completely static SPA (Single Page Application). After Docker build it is purely HTML/CSS/JS served by nginx.
- The **backend** is a single statically-compiled Go binary with no external framework — only stdlib `net/http` plus a small set of dependencies.
- All three services run as Docker containers orchestrated by Docker Compose.

---

## 3. Repository Layout

```
/
├── docker-compose.yml          # Orchestrates db + api + frontend containers
├── README.md
├── backend/
│   ├── Dockerfile              # Multi-stage Go build → minimal alpine image
│   ├── go.mod                  # Module: taskflow/backend
│   ├── go.sum
│   ├── cmd/
│   │   └── api/
│   │       ├── main.go         # Entry point: wires DB, migrations, server, graceful shutdown
│   │       ├── models.go       # Go structs matching DB tables; context key
│   │       ├── middleware.go   # JWT auth, CORS, request logging middleware
│   │       ├── handlers_auth.go    # POST /auth/register, POST /auth/login, GET /users
│   │       ├── handlers_projects.go# CRUD endpoints for projects + stats
│   │       ├── handlers_tasks.go   # CRUD endpoints for tasks
│   │       ├── handlers_sse.go     # GET /projects/{id}/events (SSE stream)
│   │       ├── broker.go       # In-memory pub/sub for SSE events
│   │       ├── db.go           # Reusable DB query helpers (canAccess, findProject, etc.)
│   │       ├── helpers.go      # JSON encode/decode, validation, pagination, uuid util
│   │       └── main_test.go    # Integration tests (require TEST_DATABASE_URL)
│   └── migrations/
│       ├── 000001_create_schema.sql   # Creates extensions, enums, tables, indexes
│       └── 000002_seed_data.sql       # Inserts demo users, project, and tasks
└── frontend/
    ├── Dockerfile              # Multi-stage: npm build → nginx serve
    ├── index.html              # HTML shell, mounts React at #root
    ├── nginx.conf              # SPA fallback: all routes → index.html
    ├── package.json            # React 18, react-router-dom v6, Vite, TypeScript
    ├── tsconfig.json
    ├── vite.config.ts          # Vite + @vitejs/plugin-react
    └── src/
        ├── App.tsx             # Root: dark mode, AuthProvider, Router, routes
        ├── main.css            # Design tokens (CSS vars), all component styles
        ├── types.ts            # TypeScript interfaces: User, Project, Task, SSETaskEvent
        ├── vite-env.d.ts       # Vite env type declarations
        ├── api/
        │   └── client.ts       # fetch wrapper: request<T>(path, options)
        ├── context/
        │   └── AuthContext.tsx # React Context: token, user, login, register, logout
        ├── hooks/
        │   ├── useDarkMode.ts      # Dark mode toggle + localStorage persistence
        │   └── useProjectEvents.ts # EventSource (SSE) hook for real-time task events
        ├── components/
        │   ├── Layout.tsx      # Nav bar (brand, username, dark toggle, logout) + <main>
        │   ├── Protected.tsx   # Route guard: redirects to /login if no token
        │   ├── Field.tsx       # Labelled form field wrapper
        │   ├── icons.tsx       # Inline SVG icon components
        │   └── TaskModal.tsx   # Full-screen modal for creating/editing a task
        ├── pages/
        │   ├── AuthPage.tsx           # Login and Register page
        │   ├── ProjectsPage.tsx       # Project list + create-project form
        │   └── ProjectDetailPage.tsx  # Kanban board, filters, task operations
        └── utils/
            └── labelStatus.ts  # Maps status enum values to display labels
```

---

## 4. Infrastructure & Docker

### 4.1 `docker-compose.yml`

Three services:

| Service    | Image / Build           | Port | Purpose                   |
| ---------- | ----------------------- | ---- | ------------------------- |
| `db`       | `postgres:16-alpine`    | 5432 | PostgreSQL database       |
| `api`      | `./backend` Dockerfile  | 4000 | Go REST API               |
| `frontend` | `./frontend` Dockerfile | 3000 | Nginx serving built React |

**Key details:**

- **`db` healthcheck**: runs `pg_isready` every 5 s, up to 10 retries. The `api` service has `depends_on: db: condition: service_healthy` so Go never starts before postgres is ready.
- **Environment variables** for `db`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (default all `taskflow`). These can be overridden via a `.env` file in the project root.
- **`JWT_SECRET`** is required and has no default — Docker Compose will fail at startup if it is not set (`${JWT_SECRET:?...}`). This prevents accidentally running with no JWT secret.
- **`VITE_API_URL`**: passed as a Docker build `ARG` to the frontend image so the compiled JS knows where `api` lives. Default: `http://localhost:4000`.
- **Named volume** `postgres_data` persists database data between `docker compose down` / `up` cycles. Data is only lost on `docker compose down -v`.

### 4.2 Backend Dockerfile

Uses a **two-stage build**:

1. **Stage `build`** (`golang:1.22-alpine`):
   - Downloads Go module dependencies.
   - Compiles with `CGO_ENABLED=0 GOOS=linux` (static binary, no libc dependency).
   - Output: `/taskflow-api` binary.

2. **Stage (runtime)** (`alpine:3.20`):
   - Creates a non-root user `appuser`.
   - Copies only the binary and `migrations/` directory.
   - Runs as `appuser` (principle of least privilege).
   - Exposes port `4000`.

The migration files are embedded in the image so goose can run them at startup.

### 4.3 Frontend Dockerfile

Also two-stage:

1. **Stage `build`** (`node:20-alpine`):
   - Accepts `VITE_API_URL` as a build arg and injects it as an environment variable so Vite bakes it into the JS bundle at build time (not runtime).
   - `npm ci` — reproducible install from lockfile.
   - `npm run build` → `dist/` folder.

2. **Stage (runtime)** (`nginx:1.27-alpine`):
   - Copies the `dist/` folder to nginx's html root.
   - Copies a custom `nginx.conf`.
   - Exposes port `80` (mapped to host `3000` in Docker Compose).

---

## 5. Database Layer

### 5.1 Schema (migration 1)

**File**: `backend/migrations/000001_create_schema.sql`

Managed by [goose](https://github.com/pressly/goose), which tracks which migrations have been applied in a `goose_db_version` table.

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";          -- UUID generation
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
```

**Table: `users`**

| Column       | Type          | Notes                 |
| ------------ | ------------- | --------------------- |
| `id`         | `uuid`        | PK, auto-generated    |
| `name`       | `text`        | NOT NULL              |
| `email`      | `text`        | UNIQUE, NOT NULL      |
| `password`   | `text`        | bcrypt hash, NOT NULL |
| `created_at` | `timestamptz` | Default now()         |

**Table: `projects`**

| Column        | Type          | Notes                            |
| ------------- | ------------- | -------------------------------- |
| `id`          | `uuid`        | PK                               |
| `name`        | `text`        | NOT NULL                         |
| `description` | `text`        | Nullable                         |
| `owner_id`    | `uuid`        | FK → users(id) ON DELETE CASCADE |
| `created_at`  | `timestamptz` | Default now()                    |

**Table: `tasks`**

| Column        | Type            | Notes                                       |
| ------------- | --------------- | ------------------------------------------- |
| `id`          | `uuid`          | PK                                          |
| `title`       | `text`          | NOT NULL                                    |
| `description` | `text`          | Nullable                                    |
| `status`      | `task_status`   | ENUM, default `todo`                        |
| `priority`    | `task_priority` | ENUM, default `medium`                      |
| `project_id`  | `uuid`          | FK → projects(id) ON DELETE CASCADE         |
| `assignee_id` | `uuid`          | FK → users(id) ON DELETE SET NULL, nullable |
| `created_by`  | `uuid`          | FK → users(id) ON DELETE CASCADE            |
| `due_date`    | `date`          | Nullable                                    |
| `created_at`  | `timestamptz`   | Default now()                               |
| `updated_at`  | `timestamptz`   | Default now(), updated on every PATCH       |

**Indexes created:**

- `idx_projects_owner_id` — speeds up `WHERE owner_id = $1`
- `idx_tasks_project_id` — speeds up `WHERE project_id = $1`
- `idx_tasks_assignee_id` — speeds up access checks and assignee queries
- `idx_tasks_created_by` — speeds up creator-based permission checks
- `idx_tasks_status` — speeds up `WHERE status = $1` filters

**Cascade rules:**

- Deleting a user → deletes their projects → cascades to delete all tasks in those projects.
- Deleting a project → deletes all its tasks.
- Deleting a user who is an assignee → sets `assignee_id = NULL` on their tasks (no data loss).

### 5.2 Seed Data (migration 2)

**File**: `backend/migrations/000002_seed_data.sql`

Inserts two users, one project, and three tasks with known, fixed UUIDs. Uses `ON CONFLICT DO NOTHING` so re-running the migration is idempotent.

Seed credentials (both users share the same bcrypt hash — `password123`):

| User          | Email            | Password    |
| ------------- | ---------------- | ----------- |
| Test User     | test@example.com | password123 |
| Alex Reviewer | alex@example.com | password123 |

The `-- +goose Down` block removes all seed rows.

### 5.3 Entity Relationships

```
users ──< projects  (one user owns many projects)
users ──< tasks     (one user creates many tasks; via created_by)
users ──< tasks     (one user can be assigned many tasks; via assignee_id, nullable)
projects ──< tasks  (one project has many tasks)
```

---

## 6. Backend — Go API

### 6.1 Module & Dependencies

**Module name**: `taskflow/backend`  
**Go version**: 1.22

| Dependency                     | Version | Purpose                              |
| ------------------------------ | ------- | ------------------------------------ |
| `github.com/golang-jwt/jwt/v5` | v5.2.1  | JWT token creation and validation    |
| `github.com/google/uuid`       | v1.6.0  | UUID parsing/validation              |
| `github.com/lib/pq`            | v1.10.9 | PostgreSQL driver for `database/sql` |
| `github.com/pressly/goose/v3`  | v3.21.1 | Database migration runner            |
| `golang.org/x/crypto`          | v0.26.0 | bcrypt for password hashing          |

No web framework is used. The entire HTTP layer is Go's standard library `net/http`.

---

### 6.2 `main.go` — Entry Point

**Responsibilities:**

1. Reads environment variables (`DATABASE_URL`, `JWT_SECRET`, `API_PORT`).
2. Opens the PostgreSQL connection pool (`database/sql` with `lib/pq` driver).
3. Configures connection pool limits:
   - Max open connections: 10
   - Max idle connections: 5
   - Max lifetime per connection: 30 minutes
4. Calls `waitForDB()` — a polling loop that retries `db.Ping()` every second for up to 30 seconds. This is the application-layer health check separate from Docker's healthcheck.
5. Runs goose migrations (`goose.Up`) — applies any pending SQL migrations automatically on every startup.
6. Constructs the `app` struct containing `db`, `jwtSecret`, `logger`, and `broker`.
7. Registers all routes via `app.routes(mux)`.
8. Starts the HTTP server with timeouts:
   - `ReadTimeout`: 10 s
   - `ReadHeaderTimeout`: 10 s
   - `IdleTimeout`: 60 s
   - `WriteTimeout`: **deliberately omitted** because SSE connections are long-lived and a server-level write timeout would kill live streams.
9. Blocks until `SIGINT` or `SIGTERM` is received.
10. Performs a **graceful shutdown** with a 10-second context — in-flight requests are given time to complete.

**`app` struct:**

```go
type app struct {
    db        *sql.DB       // shared postgres connection pool
    jwtSecret []byte        // HMAC secret for JWT signing
    logger    *slog.Logger  // structured JSON logger (stdout)
    broker    *eventBroker  // in-memory SSE pub/sub
}
```

**Logging**: Uses Go 1.21+ `log/slog` with a JSON handler. All logs are structured JSON to stdout, suitable for collection by Docker log drivers.

**Route registration** (`app.routes`):

Routes are registered on a `http.NewServeMux()`. Go 1.22's enhanced mux supports method prefixes (`GET /path`) and path parameters (`{id}`). Protected routes are wrapped with `a.auth(...)` middleware. The full table is in §6.13.

---

### 6.3 `models.go` — Domain Types

Defines all Go structs that represent domain objects and the context key type.

```go
type ctxKey string
const userKey ctxKey = "user"   // key for storing authUser in request context
```

**`authUser`** — represents the currently authenticated user (stored in context after JWT verification):

```go
type authUser struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}
```

**`project`** — mirrors the `projects` table:

```go
type project struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    Description string `json:"description"`
    OwnerID     string `json:"owner_id"`
    CreatedAt   string `json:"created_at"`
}
```

**`task`** — mirrors the `tasks` table (note nullable pointers for optional fields):

```go
type task struct {
    ID          string  `json:"id"`
    Title       string  `json:"title"`
    Description string  `json:"description"`
    Status      string  `json:"status"`
    Priority    string  `json:"priority"`
    ProjectID   string  `json:"project_id"`
    AssigneeID  *string `json:"assignee_id"`   // pointer = nullable JSON
    CreatedBy   string  `json:"created_by"`
    DueDate     *string `json:"due_date"`       // pointer = nullable JSON
    CreatedAt   string  `json:"created_at"`
    UpdatedAt   string  `json:"updated_at"`
}
```

**`projectDetail`** — composite response for `GET /projects/{id}`:

```go
type projectDetail struct {
    project              // embedded: all project fields
    Tasks []task `json:"tasks"`
}
```

**`validationError`** — map of field name → error message, returned as JSON `{"error":"validation failed","fields":{...}}`:

```go
type validationError map[string]string
```

**`sseEvent`** — payload published through the event broker:

```go
type sseEvent struct {
    Type string   // "task_created" | "task_updated" | "task_deleted"
    Data any      // marshal-able payload
}
```

---

### 6.4 `middleware.go` — HTTP Middleware

Three middleware functions, each wraps an `http.Handler`.

**`a.auth(next http.Handler) http.Handler`** — JWT Bearer token verification

1. Reads the `Authorization` header, splits on space, expects `Bearer <token>`.
2. Parses the JWT using `golang-jwt/jwt`, verifying the HMAC-SHA256 signature with `a.jwtSecret`.
3. Extracts `user_id` and `email` claims.
4. Validates `user_id` is a valid UUID.
5. Queries the database to confirm the user still exists at that `id`/`email` — this means revoked or deleted accounts can't reuse old tokens.
6. Stores the hydrated `authUser` in the request context under `userKey`.
7. Calls `next.ServeHTTP` with the enriched context.
8. Returns `401 Unauthorized` at any failure step.

**`a.cors(next http.Handler) http.Handler`** — CORS headers

Sets permissive CORS headers on every response:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`

Responds immediately with `204 No Content` to `OPTIONS` preflight requests.

**`a.log(next http.Handler) http.Handler`** — Request logging

Wraps the response writer in a `statusRecorder` that captures the HTTP status code. After the handler completes, logs a structured `slog.Info("request")` record with:

- `method`, `path`, `status`, `duration_ms`

**`statusRecorder`** — response writer wrapper that intercepts `WriteHeader` to capture the status code. Implements `Unwrap()` so `http.ResponseController` can still access the underlying writer.

---

### 6.5 `handlers_auth.go` — Authentication Handlers

**`POST /auth/register`** (public)

1. Decodes JSON body: `{ name, email, password }`.
2. Validates: name not empty, email not empty, password ≥ 8 chars.
3. Normalises: trims whitespace from name, lowercases and trims email.
4. Hashes password with `bcrypt.GenerateFromPassword(..., cost=12)`.
5. Inserts into `users` table, returning `id, name, email`.
6. Handles unique constraint violation → `400` with `{"fields":{"email":"is already registered"}}`.
7. Issues a JWT (see `issueToken`).
8. Returns `201 Created` with `{ token, user }`.

**`POST /auth/login`** (public)

1. Decodes JSON body: `{ email, password }`.
2. Queries users by email; if not found returns `401` (no differentiation — prevents email enumeration).
3. Calls `bcrypt.CompareHashAndPassword(storedHash, providedPassword)`. If mismatch → `401`.
4. Issues a JWT.
5. Returns `200 OK` with `{ token, user }`.

**`GET /users`** (protected)

Returns all users as `{ users: [...] }` ordered by name. Used by the frontend to populate assignee dropdowns. Returns `id, name, email`.

**`issueToken(u authUser) (string, error)`**

Creates a JWT with claims:

- `user_id` — the UUID of the user
- `email` — the user's email (used as a secondary look-up key in auth middleware)
- `exp` — expires 24 hours from now

Signed with `HS256` algorithm using `a.jwtSecret`.

---

### 6.6 `handlers_projects.go` — Project Handlers

**`GET /projects`** (protected)

Lists projects the authenticated user can access: either they own the project or they are assigned to at least one task in it. Uses a `DISTINCT` query with a `LEFT JOIN tasks`.

Supports **pagination**: `?page=1&limit=20` (limit capped at 100). Returns `{ projects, page, limit, total }`.

**`POST /projects`** (protected)

1. Decodes `{ name, description }`.
2. Validates name is not blank.
3. Inserts into `projects` with `owner_id = currentUser.ID`.
4. Returns `201 Created` with the new project.

**`GET /projects/{id}`** (protected)

1. Validates `{id}` is a valid UUID.
2. Calls `canAccessProject` — checks user is owner OR assignee of any task.
3. Fetches project details.
4. Fetches all tasks (up to 1000) via `tasksForProject`.
5. Returns `{ ...project, tasks: [...] }` as `projectDetail`.

**`PATCH /projects/{id}`** (protected, owner only)

1. Calls `isProjectOwner` — only the project creator can edit project metadata.
2. Decodes partial update body where both fields are `*string` pointers (undefined vs. empty string distinction).
3. Validates name is not blank if provided.
4. Issues `UPDATE projects SET name=$1, description=NULLIF($2,'') WHERE id=$3` — `NULLIF` converts empty string to `NULL`.
5. Returns the updated project.

**`DELETE /projects/{id}`** (protected, owner only)

1. Calls `isProjectOwner`.
2. Executes `DELETE FROM projects WHERE id = $1`.
3. Checks `RowsAffected()` — returns `404` if nothing was deleted.
4. Returns `204 No Content`.

**`GET /projects/{id}/stats`** (protected)

Returns aggregated statistics for the project:

- `by_status`: counts per status (`{ "todo": 3, "in_progress": 1, "done": 2 }`).
- `by_assignee`: per-user task counts, including unassigned tasks (`{ assignee_id, name, count }`).

---

### 6.7 `handlers_tasks.go` — Task Handlers

**`GET /projects/{id}/tasks`** (protected)

Returns a paginated, filterable list of tasks for a project.

Query params:

- `?status=todo|in_progress|done` — filter by status
- `?assignee=<uuid>` — filter by assignee
- `?page=1&limit=20` — pagination

Returns `{ tasks, page, limit, total }`.

**`POST /projects/{id}/tasks`** (protected)

1. Verifies access via `canAccessProject`.
2. Decodes `{ title, description, status, priority, assignee_id, due_date }`.
3. Validates via `validateTaskInput` (title required on create, valid status/priority/UUID/date format).
4. Defaults: `status = "todo"`, `priority = "medium"` if not provided.
5. Inserts task via `insertTask`.
6. Returns `201 Created` with the new task.
7. **Publishes SSE event**: `a.broker.publish(projectID, sseEvent{Type:"task_created", Data:t})`.

**`PATCH /tasks/{id}`** (protected)

Permission check: user must be the **project owner** OR the **task creator** OR the **task assignee**. This allows:

- Project owners to manage anything.
- Task creators to edit their own tasks.
- Assignees to update their assigned tasks (e.g., mark done).

Partial update — only provided fields are changed; existing values are preserved.

After update, publishes `task_updated` SSE event.

**`DELETE /tasks/{id}`** (protected)

Permission check: user must be **project owner** OR **task creator**. Assignees cannot delete tasks.

After deletion, publishes `task_deleted` SSE event with `{ id, project_id }`.

---

### 6.8 `handlers_sse.go` — Server-Sent Events Handler

**`GET /projects/{id}/events`** (partially public — custom auth)

SSE endpoints cannot use standard `Authorization` headers because the browser's `EventSource` API does not support custom headers. Instead, the JWT is passed as a `?token=` query parameter.

**Flow:**

1. Reads `?token=` query param.
2. Calls `a.verifyToken(tokenStr)` — validates JWT and fetches user from DB.
3. Calls `canAccessProject` to verify the user may see this project's events.
4. Calls `http.NewResponseController(w)` and sets write deadline to zero (infinite) — overrides any server-level write timeout for this specific connection.
5. Sets SSE response headers:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
   - `X-Accel-Buffering: no` (tells nginx not to buffer SSE output)
6. Writes `200 OK` immediately.
7. Subscribes to the broker for this `projectID`, getting a channel `ch`.
8. Sends an initial `: connected\n\n` comment and flushes — this causes the browser's `EventSource.onopen` to fire.
9. Enters the event loop (`select`):
   - **`ch` receives event** → marshals `Data` to JSON, writes `event: <Type>\ndata: <JSON>\n\n`, flushes.
   - **Ticker (15 s)** → writes `event: ping\ndata: {}\n\n` to keep the connection alive through proxies/load balancers.
   - **`r.Context().Done()`** → client disconnected; exits loop.
10. `defer a.broker.unsubscribe(projectID, ch)` cleans up the channel registration.

**`a.verifyToken(tokenStr)`**

Same JWT parsing logic as the `auth` middleware, but used standalone for SSE (since SSE can't use headers). Also does the database lookup to ensure the user still exists.

---

### 6.9 `broker.go` — SSE Event Broker

An in-memory **publish/subscribe** system that fans out task events to all connected SSE clients watching a given project.

```go
type eventBroker struct {
    mu      sync.Mutex
    clients map[string]map[chan sseEvent]struct{}
    //       projectID → set of subscriber channels
}
```

**`subscribe(projectID string) chan sseEvent`**

- Creates a buffered channel (capacity 16) to avoid blocking the publisher.
- Adds the channel to the set for the given project under a mutex lock.
- Returns the channel for the caller to read from.

**`unsubscribe(projectID string, ch chan sseEvent)`**

- Removes the channel from the project's subscriber set.
- Called via `defer` in the SSE handler when a client disconnects.

**`publish(projectID string, ev sseEvent)`**

- Takes the mutex, copies the set of channels for that project into a slice, then releases the mutex.
- Sends the event to each channel using a **non-blocking send** (`select { case ch <- ev: default: }`).
- A slow or busy subscriber is **silently dropped** rather than blocking other subscribers or the task handler.

The buffer of 16 events per subscriber provides a small burst capacity for clients that are momentarily slow to read.

---

### 6.10 `db.go` — Database Helper Queries

Reusable functions that encapsulate common DB operations. These are methods on `*app` so they share the database pool.

**`canAccessProject(ctx, projectID, userID string) bool`**

Runs a single `SELECT EXISTS(...)` query that returns true if:

- The project exists AND
- The user is either the owner OR an assignee of any task in the project.

Returns `false` on any error or if validation fails.

**`isProjectOwner(ctx, projectID, userID string) bool`**

Simpler check — returns true only if `owner_id = $2` for the given project.

**`findProject(ctx, id string) (project, error)`**

Queries a single project row by ID, using `COALESCE(description, '')` to never return NULL for description.

**`tasksForProject(ctx, projectID, status, assignee string, page, limit int) ([]task, int, error)`**

Dynamically builds a parameterised WHERE clause:

- Always: `WHERE project_id = $1`
- Optional: `AND status = $N` if status filter provided
- Optional: `AND assignee_id = $N` if assignee filter provided

First queries `COUNT(*)` for total, then queries the page of rows with `ORDER BY created_at DESC LIMIT $N OFFSET $N`. Uses `due_date::text` to cast the PostgreSQL `date` type to a string.

**`insertTask(ctx, projectID, userID, title, description, status, priority string, assigneeID, dueDate *string) (task, error)`**

Wraps the `INSERT INTO tasks ... RETURNING ...` query. Uses `nullableString()` to convert `*string` pointers to either `nil` or the value (preventing empty-string insertions for nullable columns).

**`findTaskWithOwner(ctx, id string) (task, string, error)`**

JOIN query that returns the task plus `p.owner_id` in a single round trip. Used in PATCH/DELETE task handlers to check permissions without a separate query.

---

### 6.11 `helpers.go` — Utility Functions

**`scanProject(s scanner) (project, error)`** / **`scanTask(s scanner) (task, error)`**

Accept either `*sql.Row` or `*sql.Rows` (via the `scanner` interface) and scan into the struct. Centralises the column order expected in SELECT statements.

**`validateTaskInput(title, status, priority string, assigneeID, dueDate *string, titleRequired bool) validationError`**

Validates all task fields:

- Title: required when `titleRequired=true`
- Status: must be one of `todo`, `in_progress`, `done` (if non-empty)
- Priority: must be `low`, `medium`, `high` (if non-empty)
- AssigneeID: must be valid UUID (if non-empty)
- DueDate: must parse as `YYYY-MM-DD` (if non-empty)

Returns a `validationError` map (empty map = valid).

**`decodeJSON(w, r, dst any) bool`**

Decodes the request body into `dst`. Returns `false` and writes a 400 error response if parsing fails. Always closes the body.

**`writeJSON(w, status int, v any)`** / **`writeValidation(w, fields)` / `writeError(w, status, msg)`**

Centralised response helpers. `writeJSON` sets `Content-Type: application/json`, then JSON-encodes. Never panics — encoding errors are silently ignored.

**`currentUser(r *http.Request) authUser`**

Extracts the `authUser` from the request context. Panics if called outside the `auth` middleware (should never happen in production routes).

**`nullableString(s *string) any`**

Returns `nil` if the pointer is nil or points to an empty string, otherwise returns the string value. Used to pass nullable SQL parameters correctly.

**`validUUID(s string)`, `validStatus(s string)`, `validPriority(s string)`**

Pure validation helpers.

**`env(key, fallback string) string`**

Returns `os.Getenv(key)` if set and non-empty, otherwise returns `fallback`.

**`parsePagination(r *http.Request) (page, limit int)`**

Reads `?page=` and `?limit=` query params with safe defaults (page=1, limit=20) and an upper bound on limit (100).

**`waitForDB(ctx, db) error`**

Polls `db.PingContext` every second until success or a 30-second timeout. Used at startup to wait for the PostgreSQL container.

---

### 6.12 `main_test.go` — Integration Tests

Integration tests that run against a real PostgreSQL database. The test database URL must be provided via `TEST_DATABASE_URL`. If not set, all tests are skipped.

**`testApp(t)`** — test helper that:

1. Opens a database connection.
2. Runs goose migrations from `../../migrations`.
3. Creates an `app` struct with a known JWT secret.
4. Returns a teardown function that rolls back all migrations (`goose.DownTo(db, dir, 0)`) and closes the DB.

**`do(a, method, path, body, token)`** — request helper that:

1. Marshals `body` to JSON.
2. Creates an `httptest.Request`.
3. Wires up the full middleware chain (cors + auth + all routes).
4. Returns an `httptest.ResponseRecorder`.

**Tests included:**

| Test Name                       | What it verifies                                       |
| ------------------------------- | ------------------------------------------------------ |
| `TestRegisterAndLogin`          | Register user, login with correct/wrong credentials    |
| `TestRegisterDuplicateEmail`    | Second register with same email → 400 with field error |
| (more tests may follow pattern) | Project CRUD, task CRUD, permission rules              |

---

### 6.13 Full API Route Table

| Method   | Path                    | Auth          | Handler                  |
| -------- | ----------------------- | ------------- | ------------------------ |
| `GET`    | `/`                     | None          | Health: `{name, status}` |
| `GET`    | `/healthz`              | None          | `{status: "ok"}`         |
| `POST`   | `/auth/register`        | None          | `register`               |
| `POST`   | `/auth/login`           | None          | `login`                  |
| `GET`    | `/users`                | JWT Bearer    | `listUsers`              |
| `GET`    | `/projects`             | JWT Bearer    | `listProjects`           |
| `POST`   | `/projects`             | JWT Bearer    | `createProject`          |
| `GET`    | `/projects/{id}`        | JWT Bearer    | `getProject`             |
| `PATCH`  | `/projects/{id}`        | JWT + owner   | `updateProject`          |
| `DELETE` | `/projects/{id}`        | JWT + owner   | `deleteProject`          |
| `GET`    | `/projects/{id}/tasks`  | JWT Bearer    | `listTasks`              |
| `POST`   | `/projects/{id}/tasks`  | JWT Bearer    | `createTask`             |
| `GET`    | `/projects/{id}/stats`  | JWT Bearer    | `projectStats`           |
| `GET`    | `/projects/{id}/events` | `?token=` JWT | `projectEvents` (SSE)    |
| `PATCH`  | `/tasks/{id}`           | JWT + perms   | `updateTask`             |
| `DELETE` | `/tasks/{id}`           | JWT + perms   | `deleteTask`             |

All responses are `application/json` except SSE (`text/event-stream`) and `204 No Content`.

---

### 6.14 Authentication Flow

```
Client                                           Server
  │                                                │
  │  POST /auth/login {email, password}            │
  │ ──────────────────────────────────────────►   │
  │                                                │  SELECT user WHERE email=$1
  │                                                │  bcrypt.Compare(hash, password)
  │                                                │  JWT.Sign({user_id, email, exp:+24h})
  │  200 { token: "eyJ...", user: {...} }          │
  │ ◄──────────────────────────────────────────   │
  │                                                │
  │  [stores token in localStorage]                │
  │                                                │
  │  GET /projects  Authorization: Bearer eyJ...  │
  │ ──────────────────────────────────────────►   │
  │                                                │  jwt.Parse(token, jwtSecret)
  │                                                │  SELECT user WHERE id=$1 AND email=$2
  │                                                │  context.WithValue(r.ctx, userKey, user)
  │                                                │  → handler executes
  │  200 { projects: [...] }                       │
  │ ◄──────────────────────────────────────────   │
```

### 6.15 Authorization Rules

| Action                    | Who can perform it                                        |
| ------------------------- | --------------------------------------------------------- |
| View a project            | Project owner OR user assigned to any task in the project |
| Edit project metadata     | Project owner only                                        |
| Delete a project          | Project owner only                                        |
| View tasks in a project   | Same access rule as viewing the project                   |
| Create a task             | Anyone who can access the project                         |
| Edit a task               | Project owner OR task creator OR current assignee         |
| Delete a task             | Project owner OR task creator                             |
| View project events (SSE) | Same access rule as viewing the project                   |

---

## 7. Frontend — React + TypeScript

### 7.1 Tech Stack & Build

| Technology             | Version | Purpose                   |
| ---------------------- | ------- | ------------------------- |
| React                  | 18.3    | UI component library      |
| TypeScript             | 5.5     | Type safety               |
| Vite                   | 5.4     | Dev server and bundler    |
| react-router-dom       | 6.26    | Client-side routing (SPA) |
| `@vitejs/plugin-react` | 4.3     | React Fast Refresh in dev |

**Build commands:**

- `npm run dev` → Vite dev server with Hot Module Replacement (HMR), binds all interfaces (`--host 0.0.0.0`).
- `npm run build` → TypeScript compile (`tsc`) then Vite bundle into `dist/`.
- `npm run preview` → local preview of the production build.

The `VITE_API_URL` environment variable is injected at **build time** by Vite into the bundle. The `import.meta.env.VITE_API_URL` usage in `client.ts` is replaced statically by the bundler.

---

### 7.2 `index.html`

Minimal HTML shell. Contains only:

- `<meta charset>` and `<meta viewport>`
- `<title>TaskFlow</title>`
- `<div id="root"></div>` — React mount point
- `<script type="module" src="/src/App.tsx">` — Vite resolves this during dev and replaces it with bundled JS in production.

---

### 7.3 `App.tsx` — Root Component & Routing

The entry point is `App.tsx`, rendered into `#root` via `createRoot`.

`App` component:

1. Calls `useDarkMode()` to get `[dark, toggleDark, resetDark]`.
2. Wraps everything in `<AuthProvider onLogout={resetDark}>` — so dark mode resets on logout.
3. Wraps in `<Router>` (BrowserRouter with HTML5 history).
4. Defines routes:

| Path            | Component                  | Guard     |
| --------------- | -------------------------- | --------- |
| `/`             | Redirect → `/projects`     | —         |
| `/login`        | `AuthPage mode="login"`    | —         |
| `/register`     | `AuthPage mode="register"` | —         |
| `/projects`     | `ProjectsPage`             | Protected |
| `/projects/:id` | `ProjectDetailPage`        | Protected |

`Protected` wraps routes to redirect unauthenticated users to `/login`.

`onToggleDark` and `dark` are passed down as props to pages that need to render the dark toggle button in the nav bar.

---

### 7.4 `main.css` — Global Styles & Design Tokens

All styles are in a single file using CSS custom properties (variables) for a consistent design system.

**Design tokens (`:root`):**

| Variable       | Light Value           | Purpose                           |
| -------------- | --------------------- | --------------------------------- |
| `--bg`         | `#f6f7f3`             | Page background                   |
| `--bg-card`    | `#ffffff`             | Card/panel background             |
| `--bg-nav`     | `#ffffff`             | Navigation bar background         |
| `--border`     | `#dfe4dc`             | General borders                   |
| `--text`       | `#1e2623`             | Primary text                      |
| `--text-muted` | `#65706b`             | Secondary/helper text             |
| `--brand`      | `#1f5b45`             | Primary brand colour (dark green) |
| `--pill-bg`    | `#e8efe7`             | Status pill backgrounds           |
| `--shadow`     | `rgba(35,51,45,0.08)` | Card drop shadows                 |

Dark mode overrides all tokens under `:root.dark` (deep greens/blacks). Applied via `document.documentElement.classList.toggle("dark", dark)`.

**Key CSS classes:**

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.shell`             | Full-height page wrapper                         |
| `.nav`               | Flex navbar with brand + actions                 |
| `.brand`             | Brand/logo text link                             |
| `.page`              | Centred content container, max-width 1120px      |
| `.grid`              | CSS Grid: `repeat(auto-fit, minmax(260px, 1fr))` |
| `.toolbar`           | Space-between flex row for headings + actions    |
| `.card`              | White rounded card with shadow                   |
| `.project-link`      | Card that is a full clickable link               |
| `.column`            | Kanban column container                          |
| `.column--drag-over` | Drag-over highlight (dashed brand border)        |
| `.task-card`         | Individual task card in Kanban column            |
| `.pill`              | Rounded badge (status, priority, counts)         |
| `.priority-high`     | Red pill background                              |
| `.priority-medium`   | Yellow pill background                           |
| `.priority-low`      | Light teal pill background                       |
| `.button`            | Primary CTA button (brand colour)                |
| `.button.secondary`  | Ghost button (outlined)                          |
| `.button.danger`     | Red destructive button                           |
| `.icon-btn`          | Square icon-only button                          |
| `.field`             | Labelled form field container                    |
| `.modal-backdrop`    | Full-screen overlay for task modal               |
| `.modal`             | Centred modal card                               |
| `.auth`              | Two-column auth page layout                      |
| `.auth-art`          | Left decorative panel                            |
| `.auth-panel`        | Right panel with the form                        |
| `.live-badge`        | SSE connection status indicator                  |
| `.live-badge--on`    | Green dot when SSE is connected                  |
| `.pagination`        | Flex row for page navigation buttons             |
| `.error`             | Error message styling (red border/background)    |
| `.success-toast`     | Success notification overlay                     |
| `.empty`             | Empty state placeholder text                     |

---

### 7.5 `types.ts` — Shared TypeScript Types

Defines all shared types as exported TypeScript interfaces, used across pages, components, and the API client.

**`User`**: `{ id, name, email }` — matches the `authUser` Go struct.

**`Project`**: `{ id, name, description, owner_id, created_at }` — matches the `project` Go struct.

**`Task`**: Full task with typed union enums:

```typescript
status: "todo" | "in_progress" | "done";
priority: "low" | "medium" | "high";
assignee_id: string | null;
due_date: string | null;
```

**`SSETaskEvent`**: Discriminated union — TypeScript can narrow `event.type` to know the shape of `event.data`:

```typescript
type SSETaskEvent =
  | { type: "task_created"; data: Task }
  | { type: "task_updated"; data: Task }
  | { type: "task_deleted"; data: { id: string; project_id: string } };
```

**`AuthContextValue`**: Interface for what `AuthContext` exposes: `token`, `user`, `login`, `register`, `logout`.

---

### 7.6 `api/client.ts` — HTTP Client

Single exported function `request<T>` wrapping the Fetch API.

```typescript
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function request<T>(path, options): Promise<T>;
```

**Behaviour:**

- Builds the full URL as `API_URL + path`.
- Sets `Content-Type: application/json`.
- Adds `Authorization: Bearer <token>` if `options.token` is provided.
- JSON-stringifies `options.body` if present.
- On `204 No Content` → returns `undefined as T` (skip JSON parsing).
- On any other response: parses JSON body. If `!res.ok`:
  - Extracts `data.fields` (validation errors) or `data.error`.
  - Throws an `Error` with the message. Callers get a single rejection.
- On success: returns `data as T`.

All pages use `void request(...)` with `try/catch` or `.catch()` for error handling.

---

### 7.7 `context/AuthContext.tsx` — Auth State

A React Context that provides global authentication state to the entire component tree.

**State:**

- `token: string | null` — JWT stored in `localStorage.taskflow_token`; initialised from localStorage on first render.
- `user: User | null` — user object stored in `localStorage.taskflow_user` as JSON; parsed on first render.

**Context value** (memoised with `useMemo`):

- `token` — current JWT
- `user` — current user object
- `login(email, password)` — calls `POST /auth/login`, updates state + localStorage.
- `register(name, email, password)` — calls `POST /auth/register`, updates state + localStorage.
- `logout()` — clears `taskflow_token`, `taskflow_user`, `taskflow_dark` from localStorage, resets state, calls `onLogout()` (which resets dark mode).

**`useAuth()` hook**: A convenience hook that reads the context and throws if used outside `AuthProvider`.

The `AuthProvider` accepts `onLogout` as a prop so the parent (`App`) can hook into logout events (e.g., resetting dark mode preference).

---

### 7.8 `hooks/useDarkMode.ts`

```typescript
export function useDarkMode(): [boolean, () => void, () => void];
// returns:            [dark,    toggle,    reset]
```

- Initialises `dark` from `localStorage.getItem("taskflow_dark") === "true"`.
- On every change to `dark`: toggles the `dark` class on `document.documentElement` and writes to localStorage.
- `toggle()` — flips the boolean (memoised with `useCallback`).
- `reset()` — sets to `false` (memoised). Called on logout to reset to light mode.

---

### 7.9 `hooks/useProjectEvents.ts` — SSE Hook

```typescript
export function useProjectEvents(
  projectId: string | undefined,
  token: string | null,
  onEvent: (e: SSETaskEvent) => void,
): boolean; // returns: connected status
```

**How it works:**

1. Creates an `EventSource` at `${API_URL}/projects/${projectId}/events?token=<encoded-token>`.
2. `es.onopen` → sets `connected = true`.
3. `es.onerror` → sets `connected = false`.
4. Listens for named events with `es.addEventListener`:
   - `"ping"` → confirms still connected.
   - `"task_created"` → parses data JSON, calls `onEvent` with typed `SSETaskEvent`.
   - `"task_updated"` → same.
   - `"task_deleted"` → same.
5. Uses a `ref` (`onEventRef`) to hold the latest `onEvent` callback. The ref is updated in a `useEffect` on every render, so the SSE listeners always call the latest version without needing to be in the dependency array (avoids reconnecting on every render).
6. On unmount (or when `projectId`/`token` changes) → `es.close()` and `setConnected(false)`.

---

### 7.10 `components/Layout.tsx` — Shell Layout

Wraps every authenticated page with:

- **`<nav className="nav">`**: Contains the brand link (`TaskFlow` → `/projects`), the logged-in user's name, a dark mode toggle button (renders `MoonIcon` or `SunIcon`), and a logout button.
- **`<main className="page">`**: Renders `{children}` — the page content.

Props: `children`, `onToggleDark`, `dark`.

---

### 7.11 `components/Protected.tsx` — Route Guard

```typescript
export function Protected({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

Very simple: checks if there is a token in context. If not, redirects to `/login` using React Router's `<Navigate replace>` (replaces history entry so the user can't press back to the protected page). Otherwise renders children.

---

### 7.12 `components/Field.tsx` — Form Field Wrapper

```typescript
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}  {/* <input>, <select>, or <textarea> */}
    </label>
  );
}
```

A `<label>` wrapper that combines a bold label span with the form control. Using a `<label>` element makes the label click-target the associated input for accessibility.

---

### 7.13 `components/icons.tsx` — SVG Icons

Exports individual React components, each wrapping an inline SVG with `aria-hidden="true"` (icons are decorative — their accessible description comes from button `aria-label` attributes).

| Export          | Description                           | Used in                     |
| --------------- | ------------------------------------- | --------------------------- |
| `EyeIcon`       | Open eye (show password)              | `AuthPage` password toggle  |
| `EyeOffIcon`    | Eye with slash (hide password)        | `AuthPage` password toggle  |
| `MoonIcon`      | Crescent moon (dark mode icon)        | `Layout` dark toggle button |
| `SunIcon`       | Sun (light mode icon)                 | `Layout` dark toggle button |
| `ArrowLeftIcon` | Left-pointing arrow (back navigation) | `ProjectDetailPage`         |

All icons use `stroke="currentColor"` so they automatically inherit text colour from CSS, making them compatible with both light and dark themes.

---

### 7.14 `components/TaskModal.tsx` — Task Create/Edit Modal

A full-screen modal (rendered in-place via CSS `position: fixed` backdrop) for creating or editing tasks.

**Props:**

- `projectId` — for the create API call
- `token` — for authenticated requests
- `task` — if non-null, this is an edit; if null, this is a new task
- `users` — list of all users (for the assignee dropdown)
- `currentUser` — defaults the assignee to the logged-in user on create
- `onClose` — called when the Close button is clicked
- `onSaved(task: Task)` — called with the saved task after a successful API call

**State:**

- All task fields as individual `useState` hooks (title, description, status, priority, assignee, dueDate).
- `error` string and `saving` boolean.

**Sync effect**: `useEffect([task])` syncs all local state when the `task` prop changes. This handles the edge case where the same modal is reused for a different task (e.g., editing then editing another without unmounting).

**Submit logic:**

1. Validates title is non-empty.
2. Constructs `body` object with all fields (using empty string for `assignee_id` and `due_date` to clear them, matching backend's `NULLIF` logic).
3. If `task` exists → `PATCH /tasks/{task.id}`.
4. If no task → `POST /projects/{projectId}/tasks`.
5. On success → calls `onSaved(saved)`.

**Form fields rendered:**

- Title (`<input>`)
- Description (`<textarea>`)
- Status (`<select>`: Todo / In progress / Done)
- Priority (`<select>`: Low / Medium / High)
- Assignee (`<select>`: Unassigned + all users)
- Due date (`<input type="date">`)

---

### 7.15 `pages/AuthPage.tsx` — Login & Register

A two-column layout page (`.auth-art` decorative panel + `.auth-panel` form panel).

**Mode**: `"login"` or `"register"` passed as prop, controlling which form fields appear and which API endpoint is called.

**State:**

- `name`, `email`, `password` — form values (email pre-filled with the seed credential `test@example.com` for demo convenience).
- `showPassword` — toggles between `type="password"` and `type="text"` on the password input.
- `error`, `loading`, `registrationSuccess`.

**Submit flow:**

1. Client-side validation: valid email format, password ≥ 8 chars, name ≥ 2 chars (register only).
2. Sets loading state.
3. Calls `login(email, password)` or `register(name, email, password)` from `AuthContext`.
4. On success (login) → `navigate("/projects")`.
5. On success (register) → shows `registrationSuccess` toast → after 1200ms navigates to `/projects`.
6. On error → displays the error message.

The password field includes an eye-icon toggle button (`EyeIcon` / `EyeOffIcon`) for show/hide.

A link at the bottom switches between login/register modes.

---

### 7.16 `pages/ProjectsPage.tsx` — Projects List

Displays a grid of project cards and a form to create new projects.

**State:** `projects[]`, `loading`, `error`, `name`/`description` (create form), `page`, `total`.

**On mount**: calls `load(page)` which fetches `GET /projects?page=1&limit=12`.

**Create project**: on form submit, calls `POST /projects`, prepends result to `projects` state array.

**Project grid**: each project rendered as a `<Link className="card project-link">` — the entire card is clickable and navigates to `/projects/{id}`.

**Pagination**: when `totalPages > 1`, shows Prev/Next buttons. Page change triggers a new `load()` call.

---

### 7.17 `pages/ProjectDetailPage.tsx` — Kanban Board

The most complex component. Shows a Kanban board with three columns, real-time updates, filters, and project/task management.

**URL params**: `id` from React Router `useParams`. Filter state (`status`, `assignee`) stored in URL search params (`useSearchParams`) so filters survive page refresh and are shareable.

**State:**

- `project` — the project metadata
- `tasks[]` — current visible task list
- `users[]` — all users (for assignee display and dropdown)
- `editing: Task | null` — which task the edit modal shows
- `showCreate: boolean` — whether the create task modal is open
- `editingProject: boolean` — whether the inline project-edit form is shown
- `projectName`, `projectDescription` — edit form controlled inputs
- `error`, `loading`
- `taskPage`, `taskTotal` — task pagination
- `dragOverCol` — which Kanban column is being dragged over (for CSS highlight)

**SSE integration:**

```typescript
const sseConnected = useProjectEvents(id, token, (event: SSETaskEvent) => {
  if (event.type === "task_created") {
    /* prepend task if not already present */
  } else if (event.type === "task_updated") {
    /* replace in array */
  } else if (event.type === "task_deleted") {
    /* filter out */
  }
});
```

`sseConnected` drives the `● Live` / `○ Connecting` badge in the toolbar.

**Initial data load**: `Promise.all([GET /projects/{id}, GET /users])` — parallel fetch for speed.

**Filter effects:**

- `useEffect([status, assignee])` — re-fetches task list when URL filters change, resets to page 1.
- `useEffect([taskPage])` — re-fetches when page number changes (skips initial mount condition).

**Kanban grouping:**

```typescript
const grouped = {
  todo: tasks.filter((t) => t.status === "todo"),
  in_progress: tasks.filter((t) => t.status === "in_progress"),
  done: tasks.filter((t) => t.status === "done"),
};
```

**Drag-and-drop (HTML5 Drag API):**

- `onDragStart` on each task card: stores `taskId` in `dataTransfer`.
- `onDragOver` on each column: calls `e.preventDefault()` (required to allow drop), updates `dragOverCol`.
- `onDragLeave` on column: clears `dragOverCol`.
- `onDrop` on column: reads `taskId` from `dataTransfer`, finds the task, calls `optimisticStatus`.

**Optimistic status update:**

1. Immediately updates `tasks` state with the new status (UI feels instant).
2. Makes `PATCH /tasks/{id}` API call.
3. On success: replaces the task with the server-confirmed version.
4. On failure: reverts `tasks` to the previous state and shows an error.

**Project editing** (owner only): inline form that replaces the heading/toolbar. `PATCH /projects/{id}` updates metadata; on save, merges result into `project` state.

**Task deletion**: `window.confirm` then optimistic array removal + `DELETE /tasks/{id}`. Reverts on error.

**Project deletion** (owner only): `window.confirm` then `DELETE /projects/{id}`, then navigate to `/projects`.

---

### 7.18 `utils/labelStatus.ts`

```typescript
export function labelStatus(status: Task["status"]): string;
```

Converts the API/DB status values to user-facing column headings:

- `"in_progress"` → `"In progress"`
- `"todo"` → `"Todo"`
- `"done"` → `"Done"`

Used in the Kanban board to render column `<h3>` headings.

---

## 8. Data Flow Walkthrough

### 8.1 Login

```
User types email+password → clicks Log in
  AuthPage.submit()
    → useAuth().login(email, password)
      → request<{token,user}>("POST /auth/login", {body})
        fetch("http://localhost:4000/auth/login", {method:"POST", body:JSON})
          → Go: login handler
              SELECT user WHERE email = ?
              bcrypt.Compare(hash, password)
              jwt.Sign({user_id, email, exp})
          ← 200 {token:"eyJ...", user:{id,name,email}}
      localStorage.setItem("taskflow_token", token)
      localStorage.setItem("taskflow_user", JSON.stringify(user))
      setToken(token); setUser(user)
    navigate("/projects")
```

### 8.2 Create a Task

```
User fills TaskModal → clicks Save task
  TaskModal.submit()
    → request<Task>("POST /projects/{id}/tasks", {method:"POST", token, body})
        fetch(url, {Authorization: "Bearer eyJ..."})
          → Go: auth middleware
              jwt.Parse(token)
              SELECT user WHERE id=? AND email=?
              context.WithValue(ctx, userKey, user)
            → createTask handler
                canAccessProject(ctx, projectID, user.ID)
                validateTaskInput(...)
                insertTask(ctx, ...) → INSERT INTO tasks RETURNING *
                broker.publish(projectID, {Type:"task_created", Data:task})
          ← 201 {task object}
      onSaved(task) → upsertTask(task)
        setTasks(prev => [task, ...prev])
```

### 8.3 Real-Time SSE Update

When another user in the same project creates/edits/deletes a task:

```
Server side (broker.publish):
  broker.publish(projectID, {Type:"task_created", Data:task})
    for each subscriber channel for this projectID:
      non-blocking send to channel

Server side (SSE handler loop):
  case ev := <-ch:
    json.Marshal(ev.Data) → b
    fmt.Fprintf(w, "event: task_created\ndata: %s\n\n", b)
    rc.Flush()  ← sends to client immediately

Client side (useProjectEvents hook):
  EventSource fires "task_created" event
  handle("task_created")(e):
    JSON.parse(e.data) → Task object
    onEventRef.current({type:"task_created", data:Task})

ProjectDetailPage SSE handler:
  setTasks(prev => prev.includes(task) ? prev : [task, ...prev])
  // task card appears immediately in the correct Kanban column
```

### 8.4 Drag-and-Drop Status Change

```
User drags task from "Todo" column to "In progress" column
  handleDragStart(e, taskId) → e.dataTransfer.setData("taskId", taskId)
  handleDragOver(e, "in_progress") → e.preventDefault(); setDragOverCol("in_progress")
    → CSS: .column--drag-over applied → dashed green border appears
  handleDrop(e, "in_progress"):
    taskId = e.dataTransfer.getData("taskId")
    task = tasks.find(t => t.id === taskId)
    optimisticStatus(task, "in_progress"):
      1. setTasks(tasks.map(t => t.id===task.id ? {...t, status:"in_progress"} : t))
         → task card moves to "In progress" column IMMEDIATELY
      2. PATCH /tasks/{taskId} {status: "in_progress"}
         → Go: updateTask handler → UPDATE tasks SET status=... RETURNING *
         → broker.publish(projectID, {Type:"task_updated", Data:updatedTask})
      3. setTasks(current.map(t => t.id===task.id ? serverTask : t))
         → task replaced with server-confirmed version
```

---

## 9. Security Design

| Concern                       | Implementation                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Password storage**          | bcrypt with cost 12 — resistant to brute-force; never stored in plain text                                                           |
| **Authentication**            | JWT (HS256). Every protected request validates the token signature and performs a DB user lookup                                     |
| **Token expiry**              | JWTs expire after 24 hours (`exp` claim)                                                                                             |
| **SSE auth**                  | Token passed as `?token=` query param (unavoidable with `EventSource`); verified server-side                                         |
| **SQL injection**             | All DB queries use parameterised statements (`$1`, `$2`, ...) — no string concatenation of user input                                |
| **UUID validation**           | All path parameters (`{id}`, `assignee_id`) are validated with `uuid.Parse` before use in queries                                    |
| **Input validation**          | All inputs validated before DB operations; enum values checked against allow-lists                                                   |
| **Access control**            | Every endpoint checks the authenticated user's relationship to the resource (owner/assignee/creator)                                 |
| **CORS**                      | Currently uses `Access-Control-Allow-Origin: *` — permissive for development. For production, restrict to the actual frontend origin |
| **Privilege separation**      | Backend runs as non-root `appuser` inside the Docker container                                                                       |
| **Graceful shutdown**         | 10-second shutdown grace period — prevents abrupt connection drops                                                                   |
| **No sensitive data in logs** | Logging middleware logs only method, path, status, duration — never request bodies or tokens                                         |

---

## 10. Running the Project

### Prerequisites

- Docker and Docker Compose installed.
- A `.env` file in the project root.

### `.env` File

```env
JWT_SECRET=your-super-secret-key-here
# Optional overrides (defaults shown):
# POSTGRES_USER=taskflow
# POSTGRES_PASSWORD=taskflow
# POSTGRES_DB=taskflow
# POSTGRES_PORT=5432
# API_PORT=4000
# VITE_API_URL=http://localhost:4000
```

### Start Everything

```bash
docker compose up --build
```

This:

1. Builds the Go binary and the React bundle.
2. Starts PostgreSQL, waits for it to be healthy.
3. Starts the API server (runs migrations automatically).
4. Starts nginx serving the frontend.

| Service  | URL                   |
| -------- | --------------------- |
| Frontend | http://localhost:3000 |
| API      | http://localhost:4000 |
| Database | localhost:5432        |

### Seed Credentials

| Email            | Password    |
| ---------------- | ----------- |
| test@example.com | password123 |
| alex@example.com | password123 |

### Running Backend Tests

```bash
# Requires a test Postgres instance
export TEST_DATABASE_URL="postgres://taskflow:taskflow@localhost:5432/taskflow_test?sslmode=disable"
cd backend
go test ./cmd/api/...
```

Tests are skipped automatically (not failed) if `TEST_DATABASE_URL` is not set.

### Local Development (without Docker)

**Backend:**

```bash
export DATABASE_URL="postgres://taskflow:taskflow@localhost:5432/taskflow?sslmode=disable"
export JWT_SECRET="dev-secret"
cd backend
go run ./cmd/api
```

**Frontend:**

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:4000 npm run dev
# → http://localhost:5173
```
