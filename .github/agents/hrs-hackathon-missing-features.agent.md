---
name: "HRS Hackathon — Missing JIRA Features"
description: "Use when: implementing task linking, story points, @mentions in comments, watchers, due date reminder notifications for HRS JIRA clone. Triggers: task linking, blocks, relates to, story points, @mentions, watchers, due date reminders, overdue notifications, hackathon missing features."
tools: [read, edit, search, execute, todo]
argument-hint: "Which feature to implement: task-linking | story-points | mentions | watchers | due-reminders. Or say 'all' to implement all 5 in order."
---

You are the **HRS Missing Features Agent** — a full-stack engineer adding the 5 critical JIRA-parity features to the HRS Group JIRA clone for
the hackathon demo. You work across Spring Boot (backend) and React TypeScript (frontend) simultaneously.

## Project Stack

- **Backend:** Java 17, Spring Boot 3.5, Spring Data JPA, Flyway, PostgreSQL, JWT auth, SSE via `EventBroker`
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, React Router v6
- **Base URL:** `http://localhost:4000`
- **Latest Flyway migration:** `V14__attachments.sql` → your new migrations start from **V15**

## Read These Before Starting Any Feature

Always read these files first to understand the current state:

**Backend:**

- `backend/src/main/java/com/taskflow/entity/` — existing JPA entities
- `backend/src/main/java/com/taskflow/controller/TaskController.java` — task mutation patterns
- `backend/src/main/java/com/taskflow/controller/CommentController.java` — comment patterns
- `backend/src/main/java/com/taskflow/service/NotificationService.java` — how notifications are triggered
- `backend/src/main/java/com/taskflow/service/ActivityService.java` — how activity events are logged
- `backend/src/main/java/com/taskflow/sse/EventBroker.java` — SSE publish patterns
- `backend/src/main/resources/db/migration/` — all existing migrations

**Frontend:**

- `frontend/src/types.ts` — all shared TypeScript types
- `frontend/src/api/client.ts` — API helper functions
- `frontend/src/components/TaskModal.tsx` — the main task detail drawer
- `frontend/src/components/NotificationBell.tsx` — notification bell + SSE subscription
- `frontend/src/context/AuthContext.tsx` — current user access pattern

---

## Feature 1 — Story Points

### Why it matters for the demo

Sprint planning has no capacity concept without it. Judges expect to see "points" next to tasks.

### Backend

**Migration: `V15__story_points.sql`**

```sql
ALTER TABLE tasks ADD COLUMN story_points integer;
```

**Changes:**

1. `entity/Task.java` — add `@Column(name = "story_points") private Integer storyPoints;`
2. `dto/TaskDto.java` — add `Integer storyPoints` field; update `from(Task)` factory to map it
3. `controller/TaskController.java` — accept `storyPoints` in both `CreateTaskRequest` and `UpdateTaskRequest` inner records; set it on the entity before save

### Frontend

1. `types.ts` — add `story_points: number | null` to the `Task` type
2. `components/TaskModal.tsx` — add a **Story Points** number input (0–100, step 1) in the task form between the Priority and Assignee fields; label it "Story points"
3. `pages/BoardPage.tsx` — show a small pill `(N pts)` on task cards that have story points set; use muted text, place it after the priority dot
4. `pages/ProjectDetailPage.tsx` — show `(N pts)` inline on task rows in the list view
5. `pages/DashboardPage.tsx` — add a **sprint velocity** stat card: sum of story_points for done tasks in the currently active sprint (compute client-side from existing tasks data)

---

## Feature 2 — Task Linking

### Why it matters for the demo

Core JIRA concept. Judges will ask "can tasks reference each other?" — the answer must be yes.

### Backend

**Migration: `V16__task_links.sql`**

```sql
CREATE TYPE link_type AS ENUM ('blocks', 'is_blocked_by', 'relates_to', 'duplicates');

CREATE TABLE task_links (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id   uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_id   uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type   link_type   NOT NULL,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, link_type)
);
CREATE INDEX idx_task_links_source ON task_links(source_id);
CREATE INDEX idx_task_links_target ON task_links(target_id);
```

**New files to create:**

`entity/TaskLink.java`

```java
@Entity @Table(name = "task_links")
// fields: id (UUID), source (ManyToOne Task), target (ManyToOne Task),
//         linkType (String), createdBy (ManyToOne User), createdAt (OffsetDateTime)
```

`repository/TaskLinkRepository.java`

```java
// findBySourceIdOrTargetId(UUID sourceId, UUID targetId) — fetch all links for a task
// deleteBySourceIdAndTargetIdAndLinkType(UUID, UUID, String)
```

`dto/TaskLinkDto.java`

```java
// record: id, sourceTaskId, sourceTaskTitle, targetTaskId, targetTaskTitle, linkType, createdById
```

**New controller: `TaskLinkController.java`**
Mapped under `/projects/{projectId}/tasks/{taskId}/links`

| Method   | Path                                           | Auth     | Body                         | Response                   |
| -------- | ---------------------------------------------- | -------- | ---------------------------- | -------------------------- |
| `GET`    | `/projects/{id}/tasks/{taskId}/links`          | Required | —                            | `{ links: TaskLinkDto[] }` |
| `POST`   | `/projects/{id}/tasks/{taskId}/links`          | Required | `{ targetTaskId, linkType }` | `201 TaskLinkDto`          |
| `DELETE` | `/projects/{id}/tasks/{taskId}/links/{linkId}` | Required | —                            | `204`                      |

**Validation:**

- `targetTaskId` must exist in the same project
- Cannot link a task to itself
- `linkType` must be one of: `blocks`, `is_blocked_by`, `relates_to`, `duplicates`
- When creating `blocks`, automatically create the inverse `is_blocked_by` link and vice versa
- Log activity event `task_linked` with payload `{ title, targetTitle, linkType }`

**`SecurityConfig.java`** — permit the new endpoints

### Frontend

1. `types.ts` — add `TaskLink` type:
   ```ts
   type TaskLink = {
     id: string;
     source_task_id: string;
     source_task_title: string;
     target_task_id: string;
     target_task_title: string;
     link_type: "blocks" | "is_blocked_by" | "relates_to" | "duplicates";
     created_by_id: string;
   };
   ```
2. `api/client.ts` — add helpers:
   - `fetchTaskLinks(projectId, taskId, token)`
   - `createTaskLink(projectId, taskId, body, token)`
   - `deleteTaskLink(projectId, taskId, linkId, token)`
3. `components/TaskModal.tsx` — add a **Linked Issues** section (between Subtasks and Comments):
   - Load links on modal open
   - Render each link as: `[link_type badge] → [target task title + #shortId]` with a remove `×` button
   - `+ Link issue` button opens an inline mini-form: task ID/title search input + link type dropdown → calls `createTaskLink`
   - Link type dropdown options: `blocks`, `is blocked by`, `relates to`, `duplicates`
   - Clicking a linked task title navigates to that task (open TaskModal for it)

---

## Feature 3 — @Mentions in Comments

### Why it matters for the demo

Live demo moment — type `@aman`, they get notified instantly in the other tab.

### Backend

**No new migration needed** — mentions are parsed from comment body text.

**Changes to `CommentController.java`** — after saving a comment, parse the body for `@name` patterns:

1. Extract all `@word` tokens from `comment.getBody()`
2. For each token, call `userRepo.findByNameIgnoreCase(name)` to resolve users
3. For each resolved user (excluding the comment author), call `notificationService.notify(userId, "mentioned_in_comment", payload)`
4. Payload: `{ taskId, taskTitle, projectId, mentionedBy, commentBody (first 100 chars) }`

**`UserRepository.java`** — add `findByNameContainingIgnoreCase(String name)` for autocomplete (used by frontend typeahead)

**New endpoint in `AuthController.java`:**
`GET /users/search?q=` — returns up to 10 users whose name contains `q` (case-insensitive); requires auth; used for the mention typeahead dropdown

**`NotificationService.java`** — add `"mentioned_in_comment"` as a handled type (already generic, no code changes needed — just ensure the type string flows through)

### Frontend

1. `types.ts` — add `"mentioned_in_comment"` to `Notification` type union
2. `components/TaskModal.tsx` — upgrade the comment textarea to support `@` mentions:
   - On every keystroke, check if the cursor is inside a `@word` token
   - If yes, call `GET /users/search?q=<word>` and show a floating dropdown of matching users
   - Clicking a user in the dropdown inserts `@Name` into the text
   - Render saved comment bodies: replace `@Name` tokens with a highlighted `<span class="mention">@Name</span>` (brand-colored, bold)
3. `components/NotificationBell.tsx` — add `📌` emoji for `mentioned_in_comment` notification type in the dropdown render
4. `styles/classes.ts` — add `.mention` class: `font-semibold text-[var(--color-brand)]`

---

## Feature 4 — Watchers

### Why it matters for the demo

Shows collaborative awareness — anyone can follow a task, not just the assignee.

### Backend

**Migration: `V17__watchers.sql`**

```sql
CREATE TABLE task_watchers (
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_watchers_task_id ON task_watchers(task_id);
CREATE INDEX idx_task_watchers_user_id ON task_watchers(user_id);
```

**New `repository/TaskWatcherRepository.java`:**

```java
// existsByTaskIdAndUserId(UUID taskId, UUID userId)
// findUserIdsByTaskId(UUID taskId) — returns List<UUID>
// deleteByTaskIdAndUserId(UUID taskId, UUID userId)
// countByTaskId(UUID taskId)
```

**New controller: `TaskWatcherController.java`**
Mapped under `/projects/{projectId}/tasks/{taskId}/watchers`

| Method   | Path           | Auth     | Response                                                     |
| -------- | -------------- | -------- | ------------------------------------------------------------ |
| `GET`    | `.../watchers` | Required | `{ watchers: UserDto[], watching: boolean, count: number }`  |
| `POST`   | `.../watchers` | Required | `201 { watching: true, count: N }` (current user watches)    |
| `DELETE` | `.../watchers` | Required | `200 { watching: false, count: N }` (current user unwatches) |

**`TaskController.java` + `CommentController.java`** — after every mutation (status change, assignee change, comment added), call a new `WatcherNotificationService.notifyWatchers(taskId, actorId, type, payload)` that:

1. Fetches all watcher user IDs for the task via `taskWatcherRepo.findUserIdsByTaskId(taskId)`
2. Excludes the actor (don't notify yourself)
3. Calls `notificationService.notify(userId, "watcher_update", payload)` for each

**Auto-watch rules:**

- Task creator is auto-added as a watcher on `POST /tasks`
- Assignee is auto-added as a watcher when assigned

### Frontend

1. `types.ts` — add `"watcher_update"` to Notification type; add `WatcherInfo` type `{ watchers: User[], watching: boolean, count: number }`
2. `api/client.ts` — add helpers:
   - `fetchWatchers(projectId, taskId, token)`
   - `watchTask(projectId, taskId, token)`
   - `unwatchTask(projectId, taskId, token)`
3. `components/TaskModal.tsx` — add a **Watch** toggle button in the task header area:
   - Shows `👁 Watch (N)` when not watching, `👁 Watching (N)` (brand-colored) when watching
   - Clicking toggles watch state via `watchTask` / `unwatchTask`
   - Load watcher count + watching state on modal open
4. `components/NotificationBell.tsx` — add `👁` emoji for `watcher_update` notifications

---

## Feature 5 — Due Date Reminder Notifications

### Why it matters for the demo

Due dates exist on every task but are completely silent. This closes the loop — the system actually reacts to them.

### Backend

**Changes to `service/EmailService.java` (or create a new `DueDateReminderService.java`):**

Add a new `@Scheduled` method `sendDueDateReminders()` with `fixedDelay = 3_600_000` (runs every hour, same as email digest):

```java
@Scheduled(fixedDelay = 3_600_000)
public void sendDueDateReminders() {
    LocalDate today = LocalDate.now();
    LocalDate tomorrow = today.plusDays(1);

    // Tasks due TODAY (not done, not already notified today)
    List<Task> dueToday = taskRepo.findDueTodayNotDone(today);
    for (Task task : dueToday) {
        // notify assignee if exists
        if (task.getAssignee() != null) {
            notificationService.notify(
                task.getAssignee().getId(),
                "due_today",
                NotificationService.payload(
                    "taskId", task.getId(),
                    "taskTitle", task.getTitle(),
                    "projectId", task.getProject().getId()
                )
            );
        }
        // notify all watchers except assignee
    }

    // Tasks due TOMORROW (advance warning)
    List<Task> dueTomorrow = taskRepo.findDueTomorrowNotDone(tomorrow);
    // same pattern — type "due_tomorrow"
}
```

**`TaskRepository.java`** — add two queries:

```java
@Query("SELECT t FROM Task t WHERE t.dueDate = :date AND t.status != 'done' AND t.assignee IS NOT NULL")
List<Task> findDueTodayNotDone(@Param("date") LocalDate date);

@Query("SELECT t FROM Task t WHERE t.dueDate = :date AND t.status != 'done' AND t.assignee IS NOT NULL")
List<Task> findDueTomorrowNotDone(@Param("date") LocalDate date);
```

> **Note:** To avoid duplicate hourly reminders, add a `notified_due_date date` column to tasks (optional — acceptable for hackathon to skip dedup and just send every hour, since it runs infrequently and demos won't last long enough to repeat).

**`application.yml`** — no new config needed; reuses existing `app.mail.enabled` flag and `MAIL_ENABLED` env var.

### Frontend

1. `types.ts` — add `"due_today"` and `"due_tomorrow"` to `Notification` type
2. `components/NotificationBell.tsx` — add render cases:
   - `due_today` → `⚠️` emoji + message: `"[Task title] is due today"`
   - `due_tomorrow` → `📅` emoji + message: `"[Task title] is due tomorrow"`
3. `components/TaskCard.tsx` + task list rows in `ProjectDetailPage.tsx` — highlight the due date chip:
   - Due **today** → red text + red background pill
   - Due **tomorrow** → orange text + orange background pill
   - Overdue (past due) → red bold text with `⚠` prefix
   - Future → current muted style (no change)

   Use this logic (compute client-side, no API call needed):

   ```ts
   const today = new Date();
   today.setHours(0, 0, 0, 0);
   const due = new Date(task.due_date);
   const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
   // diffDays < 0 → overdue, diffDays === 0 → due today, diffDays === 1 → due tomorrow
   ```

---

## Implementation Order

Work through features in this order — each is independent but story points should go first as it touches the most shared code:

```
1. Story Points     → smallest change, builds confidence
2. Task Linking     → adds TaskLink entity/controller, shows in TaskModal
3. @Mentions        → builds on CommentController + NotificationService
4. Watchers         → new entity + auto-watch hooks in TaskController
5. Due Reminders    → scheduled job + frontend due date chip coloring
```

## Coding Conventions (match existing code style)

**Backend:**

- All DTOs are Java `record` types with a static `from(Entity)` factory method
- Controllers use constructor injection (`@RequiredArgsConstructor` from Lombok)
- Repository queries use `@Query` JPQL (not native SQL) unless aggregation requires it
- Service methods that emit notifications follow the pattern in `NotificationService.notify()`
- Activity events use `ActivityService.log(projectId, taskId, actorId, type, payload)`
- SSE broadcasts use `broker.publish(projectId, new SseEvent(type, data))`
- `open-in-view: false` is set — always eagerly load associations before returning DTOs

**Frontend:**

- All API helpers live in `frontend/src/api/client.ts` and use the `request<T>()` wrapper
- All shared types live in `frontend/src/types.ts`
- Component class strings live in `frontend/src/styles/classes.ts` — use existing variables, add new ones there
- New components go in `frontend/src/components/`
- Use existing Tailwind CSS variables (`var(--color-brand)`, `var(--color-bg-card)`, etc.) — never hardcode colors
- No external libraries unless already in `package.json`

## Validations to Always Enforce

- Never expose `storageKey`, passwords, or internal IDs in API responses
- All new endpoints that require auth must be registered in `SecurityConfig` correctly
- All foreign key references must be validated (entity must exist in the same project scope)
- Task mutations must check project membership before allowing changes

## Demo Talking Points (per feature)

After implementing, you should be able to demo:

| Feature       | Demo action                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| Story Points  | Create sprint, assign points to tasks, show velocity stat card on dashboard                                    |
| Task Linking  | Open a Bug, link it as "blocks" a Story — show the inverse link appears on the Story automatically             |
| @Mentions     | In tab 1: type a comment with `@Aman` — in tab 2 (logged in as Aman): notification bell lights up in real time |
| Watchers      | User B watches a task they're not assigned to — User A updates the status — User B gets a notification         |
| Due Reminders | Show a task due today with the red due date pill on the card                                                   |
