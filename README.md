# TaskFlow

## Overview

TaskFlow is a compact full-stack task management app. Reviewers can register or log in, create projects, add tasks, assign tasks to users, filter tasks by status or assignee, and update task status optimistically from the project detail view.

Tech stack:

- Backend: Go, `net/http`, PostgreSQL, goose migrations, bcrypt, JWT, `slog`
- Frontend: React, TypeScript, Vite, React Router, custom CSS components
- Infrastructure: Docker Compose with PostgreSQL, API, and static frontend served by nginx

## Architecture Decisions

The backend is intentionally explicit and small. It uses `database/sql` rather than an ORM so the SQL, authorization checks, and migrations are easy to review in a take-home setting. Migrations live in `backend/migrations` and run automatically at API startup through goose.

The API keeps auth separate from project/task handlers with middleware that validates `Authorization: Bearer <token>`, checks expiry through JWT claims, and loads the current user from the database. Project access follows the assignment rule: a user can list or view projects they own or have tasks assigned in. Mutating project metadata and deleting projects are owner-only. Task deletion is limited to the project owner or the task creator; task updates also allow the assignee so assigned users can move work through the board.

The frontend uses a **custom component library** (no external UI library) — all buttons, fields, cards, pills, modals, and layout primitives are hand-written CSS classes in `main.css`. This was an intentional choice to keep the bundle minimal and make every styling decision reviewable without a dependency tree. Auth state is persisted in `localStorage`, protected routes redirect to `/login`, and the task status dropdown updates immediately before reverting on API failure.

Intentional tradeoffs:

- No ORM or repository abstraction layer. With this scope, handler-level SQL is readable and avoids ceremony.
- No refresh tokens. Access tokens expire after 24 hours as requested.
- No drag-and-drop. The status dropdown covers the core status-change workflow with less failure surface.
- A small `GET /users` endpoint was added so the UI can assign tasks to other seeded or registered users.

## Bonus Features Implemented

- **Dark mode** — Toggle button in the navbar (moon/sun icon). Preference is persisted to `localStorage` and applied immediately via a `.dark` class on `<html>`. Both light and dark themes are fully styled.
- **Stats endpoint** — `GET /projects/:id/stats` returns task counts grouped by status and by assignee.
- **Real-time updates via SSE** — `GET /projects/:id/events` streams Server-Sent Events to the project detail view. The backend holds an in-process broker (per-project pub/sub channels, goroutine-safe). After every task create, update, or delete the broker pushes the event to all subscribers. The frontend opens an `EventSource` when a project is opened, applies incoming events to state using functional updates (deduplication included), and shows a "● Live" / "○ Connecting" badge in the toolbar. Because `EventSource` cannot send custom headers, the JWT is passed as a `?token=` query parameter and validated in the SSE handler independently of the regular `auth` middleware.

## Running Locally

Assuming Docker is installed:

```bash
git clone https://github.com/your-name/taskflow-your-name
cd taskflow-your-name
cp .env.example .env
docker compose up --build
```

The app will be available at:

- Frontend: http://localhost:3000
- API: http://localhost:4000
- Health check: http://localhost:4000/healthz

## Running Migrations

Migrations run automatically when the API container starts. The API waits for PostgreSQL, opens the database, then runs goose migrations from `backend/migrations`.

Each migration file includes both `-- +goose Up` and `-- +goose Down` sections.

## Test Credentials

Use the seeded account:

```text
Email:    test@example.com
Password: password123
```

There is also a second seeded user, `alex@example.com`, with the same password for assignment testing.

## API Reference

All non-auth endpoints require:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Error responses:

```json
{ "error": "validation failed", "fields": { "email": "is required" } }
```

```json
{ "error": "unauthorized" }
```

```json
{ "error": "forbidden" }
```

```json
{ "error": "not found" }
```

### Auth

`POST /auth/register`

```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }
```

Response `201`:

```json
{
  "token": "<jwt>",
  "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@example.com" }
}
```

`POST /auth/login`

```json
{ "email": "test@example.com", "password": "password123" }
```

Response `200`:

```json
{
  "token": "<jwt>",
  "user": { "id": "uuid", "name": "Test User", "email": "test@example.com" }
}
```

### Users

`GET /users`

Response `200`:

```json
{
  "users": [{ "id": "uuid", "name": "Test User", "email": "test@example.com" }]
}
```

### Projects

`GET /projects`

Response `200`:

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Website Redesign",
      "description": "Seed project for reviewing TaskFlow",
      "owner_id": "uuid",
      "created_at": "2026-04-12T10:00:00Z"
    }
  ]
}
```

`POST /projects`

```json
{ "name": "New Project", "description": "Optional description" }
```

Response `201`: created project object.

`GET /projects/:id`

Response `200`:

```json
{
  "id": "uuid",
  "name": "Website Redesign",
  "description": "Seed project for reviewing TaskFlow",
  "owner_id": "uuid",
  "created_at": "2026-04-12T10:00:00Z",
  "tasks": []
}
```

`PATCH /projects/:id`

```json
{ "name": "Updated Name", "description": "Updated description" }
```

Response `200`: updated project object.

`DELETE /projects/:id`

Response `204`.

`GET /projects/:id/stats`

Response `200`:

```json
{
  "by_status": { "todo": 1, "in_progress": 1, "done": 1 },
  "by_assignee": [{ "assignee_id": "uuid", "name": "Test User", "count": 1 }]
}
```

### Tasks

`GET /projects/:id/tasks?status=todo&assignee=uuid`

Response `200`:

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Design homepage",
      "status": "todo",
      "priority": "high",
      "project_id": "uuid",
      "assignee_id": "uuid",
      "created_by": "uuid",
      "due_date": "2026-04-15",
      "created_at": "2026-04-12T10:00:00Z",
      "updated_at": "2026-04-12T10:00:00Z"
    }
  ]
}
```

`POST /projects/:id/tasks`

```json
{
  "title": "Design homepage",
  "description": "First pass",
  "status": "todo",
  "priority": "high",
  "assignee_id": "uuid",
  "due_date": "2026-04-15"
}
```

Response `201`: created task object.

`PATCH /tasks/:id`

```json
{
  "title": "Updated title",
  "status": "done",
  "priority": "low",
  "assignee_id": "",
  "due_date": ""
}
```

Response `200`: updated task object.

`DELETE /tasks/:id`

Response `204`.

## What I'd Do With More Time

- Add integration tests around auth, project access control, and task mutation permissions.
- Add pagination to `/projects` and task list endpoints once realistic data volume exists.
- Add a stricter assignee membership model instead of allowing assignment to any user in the system.
- Add refresh tokens and token rotation for a production auth model.
- Add drag-and-drop between status columns (the kanban board structure is already in place; adding `@dnd-kit/core` would be the next step).
- Move SSE auth to a cookie or header proxy to avoid leaking the JWT in server access logs (a known tradeoff with the `EventSource` API's lack of header support).
