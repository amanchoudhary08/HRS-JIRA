# HRS Group — JIRA Clone Roadmap

## Current Stack

| Layer          | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Backend        | Spring Boot 3.5 · Spring Security · JPA/Hibernate · Flyway |
| Database       | PostgreSQL 16                                              |
| Frontend       | React 18 · TypeScript · React Router v6 · Vite             |
| Infrastructure | Docker Compose                                             |

## What Already Exists ✅

**Backend:** Auth (register/login/JWT), Projects CRUD, Tasks CRUD (status/priority/assignee/due date), SSE real-time events, health endpoint  
**Frontend:** Login/Register page, Projects list page, Project detail page with task list, Task create/edit modal, Dark mode

---

## Phase 1 — Hackathon MVP

> **Target: 3 days · Goal: demo-ready**

---

### 1.1 Project Members & Roles

#### Backend

- [ ] Create migration `V3__project_members.sql`
  ```sql
  CREATE TABLE project_members (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member',  -- owner | admin | member | viewer
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
  );
  INSERT INTO project_members (project_id, user_id, role)
    SELECT id, owner_id, 'owner' FROM projects;
  ```
- [ ] Create `ProjectMember` entity and `ProjectMemberRepository`
- [ ] Create `ProjectMemberDto`
- [ ] Add `POST /projects/{id}/members` — invite user by email
- [ ] Add `GET /projects/{id}/members` — list members with roles
- [ ] Add `PATCH /projects/{id}/members/{userId}` — change role
- [ ] Add `DELETE /projects/{id}/members/{userId}` — remove member
- [ ] Update `ProjectController` access checks to use `project_members` table instead of owner-only
- [ ] Update `ProjectRepository.findAccessibleByUser` to also include projects where user is a member

#### Frontend

- [ ] Add **Members tab** on Project Detail page (alongside tasks)
- [ ] Member list component — show avatar initials, name, role badge
- [ ] "Invite Member" modal — search user by email, pick role, send `POST /projects/{id}/members`
- [ ] Role badge component (`owner` = gold, `admin` = blue, `member` = grey, `viewer` = light grey)
- [ ] Hide edit/delete buttons for `viewer` role users
- [ ] Show member avatars on the Projects list card (up to 5 stacked)

---

### 1.2 Task Comments

#### Backend

- [ ] Create migration `V4__comments.sql`
  ```sql
  CREATE TABLE comments (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_comments_task_id ON comments(task_id);
  ```
- [ ] Create `Comment` entity, `CommentRepository`, `CommentDto`
- [ ] Add `GET /projects/{id}/tasks/{taskId}/comments`
- [ ] Add `POST /projects/{id}/tasks/{taskId}/comments`
- [ ] Add `PATCH /projects/{id}/tasks/{taskId}/comments/{commentId}` (author only)
- [ ] Add `DELETE /projects/{id}/tasks/{taskId}/comments/{commentId}` (author or project admin)
- [ ] Publish SSE event `comment_added` / `comment_deleted` to project subscribers

#### Frontend

- [ ] Expand `TaskModal` to a full **Task Detail side panel / drawer** (slide in from right)
- [ ] Comments section at the bottom of the task detail panel
- [ ] Comment list — show author avatar, name, time ago, body
- [ ] Add comment textarea + submit button
- [ ] Edit/delete comment (show on hover for own comments)
- [ ] Live append new comments via SSE `comment_added` event (no page refresh)

---

### 1.3 Task Types & Subtasks

#### Backend

- [ ] Create migration `V5__task_types.sql`
  ```sql
  ALTER TABLE tasks
    ADD COLUMN type      text NOT NULL DEFAULT 'task',
    ADD COLUMN parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
  CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
  ```
- [ ] Add `type` and `parentId` to `Task` entity and `TaskDto`
- [ ] Update `CreateTaskRequest` / `UpdateTaskRequest` to accept `type` and `parentId`
- [ ] Add `GET /projects/{id}/tasks/{taskId}/subtasks` — list direct children
- [ ] Add validation: subtasks cannot themselves have subtasks (max 1 level) unless you want full tree
- [ ] Update `TaskController` create/update logic

#### Frontend

- [ ] Add **type selector** in task create/edit form: `Task | Bug | Story | Epic`
- [ ] Type icons component:
  - Task — blue checkmark
  - Bug — red bug icon
  - Story — green bookmark
  - Epic — purple lightning bolt
- [ ] Show type icon next to task title everywhere (list, modal, board)
- [ ] "Add subtask" button inside task detail panel
- [ ] Subtasks list inside task detail panel — show title, status, type icon
- [ ] Indent subtasks under parent in the task list view
- [ ] "Parent:" breadcrumb link inside subtask detail panel

---

### 1.4 Sprints & Kanban Board ⭐ (Biggest demo impact)

#### Backend

- [ ] Create migration `V6__sprints.sql`
  ```sql
  CREATE TABLE sprints (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       text NOT NULL,
    goal       text,
    start_date date,
    end_date   date,
    status     text NOT NULL DEFAULT 'planning', -- planning | active | completed
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE tasks
    ADD COLUMN sprint_id uuid REFERENCES sprints(id) ON DELETE SET NULL,
    ADD COLUMN position  integer NOT NULL DEFAULT 0;
  CREATE INDEX idx_sprints_project_id ON sprints(project_id);
  ```
- [ ] Create `Sprint` entity, `SprintRepository`, `SprintDto`
- [ ] Add `GET /projects/{id}/sprints`
- [ ] Add `POST /projects/{id}/sprints`
- [ ] Add `PATCH /projects/{id}/sprints/{sprintId}` — update / start / complete sprint
- [ ] Add `DELETE /projects/{id}/sprints/{sprintId}`
- [ ] Add `POST /projects/{id}/sprints/{sprintId}/tasks/{taskId}` — move task into sprint
- [ ] Add `DELETE /projects/{id}/sprints/{sprintId}/tasks/{taskId}` — move task to backlog
- [ ] Add `PATCH /projects/{id}/tasks/{taskId}/position` — reorder endpoint `{ position, status }`
- [ ] Publish SSE events `sprint_started`, `sprint_completed`, `task_moved`

#### Frontend

- [ ] Install `@dnd-kit/core` and `@dnd-kit/sortable`
  ```bash
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  ```
- [ ] New page: **Board View** (`/projects/:id/board`)
- [ ] Add tab switcher on Project Detail: `Board | Backlog | Members`
- [ ] **Kanban board** — 3 columns: `To Do | In Progress | Done`
- [ ] Drag task card between columns → calls `PATCH .../position` endpoint
- [ ] Task card component — show type icon, title, priority dot, assignee avatar, due date chip
- [ ] Sprint selector dropdown at top of board — switch between active sprint / backlog
- [ ] "Create Sprint" button — name + goal + date range modal
- [ ] "Start Sprint" / "Complete Sprint" buttons (admin/owner only)
- [ ] Backlog view — flat list of tasks not in any sprint, drag to add to sprint
- [ ] Add route `/projects/:id/board` in `App.tsx`

---

### 1.5 Activity Log

#### Backend

- [ ] Create migration `V7__activity_log.sql`
  ```sql
  CREATE TABLE activity_events (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id   uuid NOT NULL REFERENCES users(id),
    type       text NOT NULL,
    payload    jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_activity_project_id ON activity_events(project_id);
  CREATE INDEX idx_activity_task_id    ON activity_events(task_id);
  ```
- [ ] Create `ActivityEvent` entity, `ActivityEventRepository`, `ActivityEventDto`
- [ ] Create `ActivityService` — `log(projectId, taskId, actorId, type, payload)`
- [ ] Call `ActivityService.log(...)` in:
  - `TaskController` — task_created, task_updated, task_deleted, status_changed, assignee_changed
  - `CommentController` — comment_added, comment_deleted
  - `SprintController` — sprint_started, sprint_completed
  - `ProjectMemberController` — member_added, member_removed, role_changed
- [ ] Add `GET /projects/{id}/activity?limit=50` — paginated, newest first
- [ ] Add `GET /projects/{id}/tasks/{taskId}/activity` — activity for a single task

#### Frontend

- [ ] Activity feed component — timeline style (icon + message + time ago)
- [ ] Messages per type: _"John moved Bug #42 to In Progress"_, _"Sarah commented on Login issue"_
- [ ] Show activity feed in **Project Detail sidebar** (right side, always visible on wide screens)
- [ ] Show task-specific activity inside Task Detail panel below comments
- [ ] Live append new events via SSE `activity_created`

---

### 1.6 Dashboard & Charts

#### Backend

- [ ] Extend `GET /projects/{id}/stats` to also return:
  - tasks per sprint (count by status)
  - tasks per type (bug/story/task/epic counts)
  - tasks created per day (last 14 days) — for burndown
  - overdue task count

#### Frontend

- [ ] Install `recharts`
  ```bash
  npm install recharts
  npm install --save-dev @types/recharts
  ```
- [ ] New page: **Dashboard** (`/projects/:id/dashboard`)
- [ ] Add `Dashboard` tab in project navigation
- [ ] **Pie chart** — tasks by status (todo/in_progress/done)
- [ ] **Bar chart** — tasks by assignee
- [ ] **Bar chart** — tasks by type (bug/story/task/epic)
- [ ] **Line chart** — tasks closed per day (last 14 days, burndown line)
- [ ] Summary stat cards at top: Total tasks · Open · In Progress · Done · Overdue
- [ ] Add route `/projects/:id/dashboard` in `App.tsx`

---

## Phase 2 — Post-Hackathon Polish

> **Target: 1–2 weeks after**

---

### 2.1 Full-Text Search

#### Backend

- [ ] Migration `V8__search_vector.sql`
  ```sql
  ALTER TABLE tasks ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
    ) STORED;
  CREATE INDEX idx_tasks_search ON tasks USING GIN(search_vector);
  ```
- [ ] Add `GET /projects/{id}/tasks/search?q=` endpoint using `@Query` with `plainto_tsquery`
- [ ] Add global `GET /search?q=` endpoint across all accessible projects

#### Frontend

- [ ] Search bar in the top navigation / Layout header
- [ ] Dropdown results panel — grouped by project
- [ ] Click result → navigate to task detail panel
- [ ] Highlight matched text in results
- [ ] Debounce input (300ms) before calling API

---

### 2.2 Labels & Tags

#### Backend

- [ ] Migration `V9__labels.sql`
  ```sql
  CREATE TABLE labels (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       text NOT NULL,
    color      text NOT NULL DEFAULT '#6366f1'
  );
  CREATE TABLE task_labels (
    task_id  uuid REFERENCES tasks(id)  ON DELETE CASCADE,
    label_id uuid REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
  );
  ```
- [ ] CRUD endpoints for labels: `GET/POST /projects/{id}/labels`, `PATCH/DELETE /projects/{id}/labels/{labelId}`
- [ ] `POST/DELETE /projects/{id}/tasks/{taskId}/labels/{labelId}` — attach/detach
- [ ] Include labels array in `TaskDto`

#### Frontend

- [ ] Label manager in project settings page
- [ ] Color picker for label creation
- [ ] Multi-select label picker inside Task create/edit form
- [ ] Label chips on task cards (board and list views)
- [ ] Filter tasks by label on board/backlog

---

### 2.3 Notifications

#### Backend

- [ ] Migration `V10__notifications.sql`
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
- [ ] Add `NotificationService` — create notification for: task assigned to you, comment on your task, mentioned in comment
- [ ] Add `GET /notifications` — current user's notifications (unread first)
- [ ] Add `PATCH /notifications/{id}/read`
- [ ] Add `PATCH /notifications/read-all`
- [ ] Add `spring-boot-starter-mail` dependency + email service for digest
- [ ] `@Scheduled` job — send hourly email digests for unread notifications

#### Frontend

- [ ] Bell icon in top nav with unread badge count
- [ ] Notifications dropdown panel — list with mark-as-read
- [ ] "Mark all read" button
- [ ] Notification item click → navigate to the related task
- [ ] Live new notifications via SSE (add `notification` event type)

---

### 2.4 File Attachments

#### Backend

- [ ] Add MinIO to `docker-compose.yml`
  ```yaml
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER:-taskflow}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:-taskflow123}
    ports: ["9000:9000", "9001:9001"]
    volumes:
      - minio_data:/data
  ```
- [ ] Add `spring-cloud-aws-s3` (or MinIO Java SDK) dependency to `pom.xml`
- [ ] Create `AttachmentService` — upload to MinIO, generate presigned download URL
- [ ] Migration `V11__attachments.sql`
  ```sql
  CREATE TABLE attachments (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    uploaded_by uuid NOT NULL REFERENCES users(id),
    filename    text NOT NULL,
    mime_type   text NOT NULL,
    size_bytes  bigint NOT NULL,
    storage_key text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  ```
- [ ] Add `POST /projects/{id}/tasks/{taskId}/attachments` — multipart upload
- [ ] Add `GET /projects/{id}/tasks/{taskId}/attachments` — list with presigned URLs
- [ ] Add `DELETE /projects/{id}/tasks/{taskId}/attachments/{attachmentId}`

#### Frontend

- [ ] Drag-and-drop file upload zone inside Task Detail panel
- [ ] File list with icon, name, size, uploader, date
- [ ] Click to download (presigned URL)
- [ ] Delete attachment (author or admin)
- [ ] Show attachment count on task card (paperclip icon + count)

---

## Phase 3 — Advanced / Production

> **Target: Month 2+**

### 3.1 Custom Workflow States

- [ ] **Backend:** `workflow_states` table per project — name, color, position. Replace hard-coded enum with dynamic states
- [ ] **Frontend:** Project settings page → drag-and-drop reorder workflow states, add/rename/delete states, pick color

### 3.2 Upgrade SSE → WebSocket

- [ ] **Backend:** Add `spring-boot-starter-websocket` + STOMP protocol, replace `EventBroker` (SSE) with WebSocket topic per project
- [ ] **Frontend:** Replace `EventSource` hook with `@stomp/stompjs` client for bi-directional events (typing indicators, live cursors)

### 3.3 Redis

- [ ] Add Redis to `docker-compose.yml`
- [ ] **Backend:** JWT token blacklist on logout, cache project member lists, rate-limit login endpoint (max 10 attempts/min)

### 3.4 Project Settings Page

- [ ] **Frontend:** New page `/projects/:id/settings` — rename project, change description, manage workflow states, danger zone (delete project, transfer ownership)
- [ ] **Backend:** Already has `PATCH/DELETE /projects/{id}` — wire up the UI

### 3.5 User Profile & Avatars

- [ ] **Backend:** Add `avatar_url` + `bio` to users table, `PATCH /users/me` endpoint
- [ ] **Frontend:** Profile page, avatar upload (to MinIO), update name/bio

### 3.6 CI/CD Pipeline

- [ ] Add `.github/workflows/ci.yml` — on PR: `mvn test`, `docker build`, lint frontend
- [ ] Add `.github/workflows/deploy.yml` — on merge to main: push to Docker Hub / GHCR

---

## New Frontend Pages & Routes Summary

| Route                     | Page                                        | Phase |
| ------------------------- | ------------------------------------------- | ----- |
| `/projects/:id`           | Project Detail (existing, extend with tabs) | Now   |
| `/projects/:id/board`     | Kanban Board                                | 1.4   |
| `/projects/:id/dashboard` | Charts & Stats                              | 1.6   |
| `/projects/:id/settings`  | Project Settings                            | 3.4   |
| `/profile`                | User Profile                                | 3.5   |

## New npm Packages Needed

| Package                             | Used for                 | Phase |
| ----------------------------------- | ------------------------ | ----- |
| `@dnd-kit/core` `@dnd-kit/sortable` | Kanban drag-and-drop     | 1.4   |
| `recharts`                          | Dashboard charts         | 1.6   |
| `@stomp/stompjs`                    | WebSocket (replaces SSE) | 3.2   |

## New Backend Dependencies Needed

| Dependency                              | Used for               | Phase |
| --------------------------------------- | ---------------------- | ----- |
| `spring-boot-starter-mail`              | Email notifications    | 2.3   |
| MinIO Java SDK or `spring-cloud-aws-s3` | File uploads           | 2.4   |
| `spring-boot-starter-websocket`         | WebSocket/STOMP        | 3.2   |
| `spring-boot-starter-data-redis`        | Caching, rate limiting | 3.3   |

---

## Hackathon Demo Script (3-minute walk-through)

| Step | What to show                                                     | Feature |
| ---- | ---------------------------------------------------------------- | ------- |
| 1    | Register two accounts in two browser tabs                        | Auth    |
| 2    | Create project "HRS Sprint 1", invite second user as member      | 1.1     |
| 3    | Create tasks: 1 Epic, 2 Stories, 1 Bug                           | 1.3     |
| 4    | Create sprint, drag tasks from backlog into sprint, start sprint | 1.4     |
| 5    | Drag a task from "To Do" → "In Progress" on board                | 1.4     |
| 6    | Open task, add a comment — show it appear live in the second tab | 1.2     |
| 7    | Show activity feed updating live                                 | 1.5     |
| 8    | Switch to Dashboard — show charts                                | 1.6     |
