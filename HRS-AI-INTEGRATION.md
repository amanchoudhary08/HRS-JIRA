# HRS-JIRA × HRS.AI — Technical Integration Document

## Table of Contents

1. [Overview](#1-overview)
2. [Current System Architecture](#2-current-system-architecture)
3. [Target Integrated Architecture](#3-target-integrated-architecture)
4. [Phase 1 — Foundation & Plumbing](#4-phase-1--foundation--plumbing)
5. [Phase 2 — UI Integration](#5-phase-2--ui-integration)
6. [Phase 3 — Deep Feature Integration](#6-phase-3--deep-feature-integration)
7. [Phase 4 — Polish & Hardening](#7-phase-4--polish--hardening)
8. [Environment & Configuration](#8-environment--configuration)
9. [API Contract Reference](#9-api-contract-reference)
10. [Database Schema Changes](#10-database-schema-changes)
11. [Security Considerations](#11-security-considerations)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Overview

### What is being integrated?

| Project      | Stack                                                        | Purpose                                                         |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| **HRS-JIRA** | Spring Boot 3.5 (Java 17), PostgreSQL, React 18 + TypeScript | Full-featured project management system (Jira clone)            |
| **HRS.AI**   | FastAPI (Python 3.11), SQLite, React 18 + TypeScript         | Enterprise agentic workforce platform with AWS Bedrock / Claude |

### Integration Goal

Surface HRS.AI's AI agent capabilities **natively inside HRS-JIRA**, so that:

- AI agents can read and write HRS-JIRA tasks, comments, and sprints
- HRS-JIRA users can trigger AI workflows without leaving the app
- All AI-driven actions are auditable in HRS-JIRA's activity feed
- Both services share the same auth layer (JWT)

### Guiding Principles

- **Non-breaking:** Every existing HRS-JIRA feature continues to work unchanged
- **Additive:** AI features are opt-in overlays, not replacements
- **Single frontend:** HRS_AI's standalone React app is dissolved into HRS-JIRA's frontend
- **Separate backends:** FastAPI and Spring Boot run as independent Docker services and communicate over the internal Docker network

---

## 2. Current System Architecture

### 2.1 HRS-JIRA

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React/TS) — nginx :3000                       │
│  Vite dev server :5173                                   │
│  Routes: /projects, /board, /dashboard, /pipeline, /api  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (VITE_API_URL / axios)
┌────────────────────▼────────────────────────────────────┐
│  Spring Boot API :4000                                   │
│  Auth: JWT (HS256, 24h) + Google OAuth2                  │
│  Controllers: Auth, Project, Task, Sprint, Label,        │
│               Comment, Attachment, Notification,         │
│               TaskLink, Search, Activity, SSE            │
└────────────────────┬────────────────────────────────────┘
                     │ JDBC / Hibernate
┌────────────────────▼────────────────────────────────────┐
│  PostgreSQL 16 :5432                                     │
│  DB: taskflow  Migration: Flyway                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 HRS.AI (current standalone)

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React/TS) — Vite :5173                        │
│  Routes: /agents, /collaborate, /skills, /analytics, …  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (Axios + JWT)
┌────────────────────▼────────────────────────────────────┐
│  FastAPI :8000                                           │
│  Routes: /api/auth, /api/agents, /api/collaborations,   │
│          /api/skills, /api/personas, /api/departments,   │
│          /api/actions, /api/documents, /api/analytics   │
│  Streaming: SSE via sse-starlette                        │
└────────────────────┬──────────────────┬─────────────────┘
                     │ SQLAlchemy       │ httpx
              ┌──────▼──────┐   ┌──────▼──────────────┐
              │ SQLite      │   │ AWS Bedrock          │
              │ hrsai.db    │   │ Claude Sonnet 4.5    │
              └─────────────┘   │ + Jira DC REST API   │
                                │ + Confluence REST API│
                                └──────────────────────┘
```

---

## 3. Target Integrated Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  HRS-JIRA Frontend (React/TS) — nginx :3000                        │
│                                                                    │
│  Existing pages          │  New AI pages (merged from HRS.AI)      │
│  /projects, /board, …    │  /ai/agents, /ai/collaborate,           │
│  + AI panel on TaskModal │  /ai/skills, /ai/analytics              │
│                                                                    │
│  api/client.ts ──────────────────────────┐                         │
│  api/aiClient.ts (new) ──────────────────┤                         │
└──────────────────────────────────────────┼─────────────────────────┘
                                           │
               ┌───────────────────────────┴──────────────────────┐
               │ HTTP :4000 (JWT)       │ HTTP :8000 (same JWT)    │
               │                       │                          │
┌──────────────▼──────────┐  ┌─────────▼──────────────────────────┐
│  Spring Boot API :4000  │  │  FastAPI AI Service :8000           │
│                         │◄─┤  (adapted to call Spring API)       │
│  + POST /auth/verify    │  │                                     │
│    (new — token check)  │  │  Existing routes preserved          │
│  + Webhook endpoints    │  │  JIRA_BASE_URL=http://api:4000      │
│    for AI triggers      │  │  JWT_SECRET shared with Spring      │
└─────────────┬───────────┘  └───────┬────────────────────────────┘
              │ JDBC                 │ SQLAlchemy / httpx
┌─────────────▼──────┐   ┌──────────▼──────┐   ┌──────────────────┐
│ PostgreSQL 16      │   │ SQLite           │   │ AWS Bedrock      │
│ (HRS-JIRA data)    │   │ (AI agent data)  │   │ Claude Sonnet 4.5│
└────────────────────┘   └─────────────────┘   └──────────────────┘
```

### Docker Network

All services run on a shared Docker bridge network `hrs_net`. Service DNS names:

- `db` → PostgreSQL
- `api` → Spring Boot
- `ai` → FastAPI
- `frontend` → nginx

---

## 4. Phase 1 — Foundation & Plumbing

### 4.1 Docker Compose Changes

**File:** `docker-compose.yml`

Add the `ai` service and a shared network:

```yaml
services:
  # ... existing db, api, frontend services ...

  ai:
    build:
      context: ./HRS_AI/backend
    environment:
      DATABASE_URL: sqlite+aiosqlite:///./hrsai.db
      JWT_SECRET: ${JWT_SECRET} # Same secret as Spring Boot
      JWT_ALGORITHM: HS256
      AWS_REGION: ${AWS_REGION:-eu-central-1}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:-}
      BEDROCK_MODEL_ID: ${BEDROCK_MODEL_ID:-eu.anthropic.claude-sonnet-4-5-20250929-v1:0}
      JIRA_BASE_URL: http://api:4000 # Points to Spring Boot internally
      ENV: production
    volumes:
      - ai_data:/app # Persist SQLite DB
    ports:
      - "8000:8000"
    depends_on:
      - api
    networks:
      - hrs_net
    restart: unless-stopped

volumes:
  postgres_data:
  ai_data:

networks:
  hrs_net:
    driver: bridge
```

Also add `networks: [hrs_net]` to the existing `db`, `api`, and `frontend` services.

---

### 4.2 Shared JWT Secret

Both Spring Boot and FastAPI must sign/verify tokens with the **same HS256 secret**.

**Spring Boot** (`application.yml`) — already uses `${JWT_SECRET}` env var.

**FastAPI** (`HRS_AI/backend/app/config.py`) — already uses `JWT_SECRET` from `.env`.

Setting the same `JWT_SECRET` in `.env` is sufficient. No code change required; just ensure the env var is identical.

---

### 4.3 Token Verification Endpoint in Spring Boot

Add a lightweight endpoint so HRS.AI can optionally validate tokens without sharing the secret in future zero-trust setups.

**New file:** `backend/src/main/java/com/taskflow/controller/AuthVerifyController.java`

```java
@RestController
@RequestMapping("/auth")
public class AuthVerifyController {

    private final JwtService jwtService;  // existing service

    @GetMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(
            @RequestHeader("Authorization") String authHeader) {
        String token = authHeader.replace("Bearer ", "");
        String userId = jwtService.extractUserId(token);  // throws if invalid
        return ResponseEntity.ok(Map.of("userId", userId, "valid", true));
    }
}
```

---

### 4.4 HRS-JIRA API Adapter in HRS.AI

Replace `HRS_AI/backend/app/services/jira_confluence_service.py` tool dispatch with calls to the HRS-JIRA Spring Boot API.

**New file:** `HRS_AI/backend/app/services/hrsjira_adapter.py`

```python
"""
Adapter: maps HRS.AI tool calls to HRS-JIRA REST API endpoints.
Called by ai_service.py dispatch_tool() in place of the Jira DC client.
"""
import httpx
from app.config import settings

JIRA_BASE = settings.JIRA_BASE_URL  # http://api:4000 in Docker

async def search_tasks(project_id: str, query: str, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{JIRA_BASE}/projects/{project_id}/tasks",
            params={"q": query, "limit": 20},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

async def get_task(project_id: str, task_id: str, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{JIRA_BASE}/projects/{project_id}/tasks/{task_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

async def create_task(project_id: str, payload: dict, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{JIRA_BASE}/projects/{project_id}/tasks",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

async def update_task(project_id: str, task_id: str, payload: dict, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{JIRA_BASE}/projects/{project_id}/tasks/{task_id}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

async def add_comment(project_id: str, task_id: str, body: str, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{JIRA_BASE}/projects/{project_id}/tasks/{task_id}/comments",
            json={"body": body},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

async def list_sprints(project_id: str, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{JIRA_BASE}/projects/{project_id}/sprints",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
```

**Update `AGENT_TOOLS` mapping in `ai_service.py`:**

```python
# Tool name → adapter function mapping
TOOL_DISPATCH = {
    "hrsjira_search_tasks":  hrsjira_adapter.search_tasks,
    "hrsjira_get_task":      hrsjira_adapter.get_task,
    "hrsjira_create_task":   hrsjira_adapter.create_task,
    "hrsjira_update_task":   hrsjira_adapter.update_task,
    "hrsjira_add_comment":   hrsjira_adapter.add_comment,
    "hrsjira_list_sprints":  hrsjira_adapter.list_sprints,
}
```

The `user_token` from the AI execution request is threaded through every tool call so agents act on behalf of the authenticated user.

---

### 4.5 CORS Configuration

**FastAPI** must allow requests from the HRS-JIRA frontend origin.

In `HRS_AI/backend/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,           # http://localhost:3000
        "http://localhost:5173",          # Vite dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Spring Boot** already has CORS configuration. Ensure it also allows requests originating from the AI service if needed (internal only — no CORS required for server-to-server).

---

## 5. Phase 2 — UI Integration

### 5.1 New Axios Client for AI Service

**New file:** `frontend/src/api/aiClient.ts`

```typescript
import axios from "axios";
import { useAuthStore } from "../context/AuthContext";

const AI_URL = import.meta.env.VITE_AI_URL ?? "http://localhost:8000";

export const aiClient = axios.create({ baseURL: `${AI_URL}/api` });

aiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**`vite.config.ts`** — add proxy for dev:

```typescript
proxy: {
  "/ai": {
    target: "http://localhost:8000",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ai/, ""),
  },
}
```

**New env var in `.env`:**

```
VITE_AI_URL=http://localhost:8000
```

In Docker build args:

```yaml
# docker-compose.yml — frontend service
args:
  VITE_API_URL: ${VITE_API_URL:-http://localhost:4000}
  VITE_AI_URL: ${VITE_AI_URL:-http://localhost:8000}
```

---

### 5.2 AI Pages Merged into Frontend

Move/recreate the following HRS.AI frontend pages into:
`frontend/src/pages/ai/`

| File                      | Route                            | Description                                      |
| ------------------------- | -------------------------------- | ------------------------------------------------ |
| `AgentsPage.tsx`          | `/ai/agents`                     | List agents, execution queue, approval workflow  |
| `ExecutionDetailPage.tsx` | `/ai/agents/executions/:id`      | Step inspector, tool call logs, streaming output |
| `CollaboratePage.tsx`     | `/ai/collaborate`                | Multi-agent mission board                        |
| `SkillsPage.tsx`          | `/ai/skills`                     | Skill file list with status lifecycle            |
| `SkillGeneratePage.tsx`   | `/ai/skills/generate/:personaId` | Live AI skill generation with streaming editor   |
| `PersonasPage.tsx`        | `/ai/personas`                   | Persona grid per department                      |
| `AIAnalyticsPage.tsx`     | `/ai/analytics`                  | AI execution metrics dashboard                   |

**`App.tsx` — add routes:**

```tsx
<Route path="/ai/agents" element={<Protected><AgentsPage /></Protected>} />
<Route path="/ai/agents/executions/:id" element={<Protected><ExecutionDetailPage /></Protected>} />
<Route path="/ai/collaborate" element={<Protected><CollaboratePage /></Protected>} />
<Route path="/ai/skills" element={<Protected><SkillsPage /></Protected>} />
<Route path="/ai/skills/generate/:personaId" element={<Protected><SkillGeneratePage /></Protected>} />
<Route path="/ai/personas" element={<Protected><PersonasPage /></Protected>} />
<Route path="/ai/analytics" element={<Protected><AIAnalyticsPage /></Protected>} />
```

---

### 5.3 ProjectSidebar — AI Section

**File:** `frontend/src/components/ProjectSidebar.tsx`

Add an "AI Workspace" collapsible section below existing nav items:

```tsx
<SidebarSection title="AI Workspace" icon={<SparklesIcon />}>
  <SidebarLink to="/ai/agents" label="Agents" icon={<BotIcon />} />
  <SidebarLink to="/ai/collaborate" label="Collaborate" icon={<UsersIcon />} />
  <SidebarLink to="/ai/skills" label="Skills" icon={<BookIcon />} />
  <SidebarLink to="/ai/personas" label="Personas" icon={<PersonIcon />} />
  <SidebarLink to="/ai/analytics" label="AI Analytics" icon={<ChartIcon />} />
</SidebarSection>
```

---

### 5.4 AI Assistant Panel on TaskModal

**File:** `frontend/src/components/TaskModal.tsx`

Add a slide-in `AIPanel` accessed via a "Sparkles" button in the task modal toolbar.

**New file:** `frontend/src/components/AIPanel.tsx`

```tsx
interface AIPanelProps {
  task: Task;
  projectId: string;
}

// Capabilities exposed in the panel:
// - "Summarize comments"  → POST /ai/api/actions/run  action=summarize_task
// - "Generate subtasks"   → POST /ai/api/actions/run  action=generate_subtasks
// - "Find related tasks"  → POST /ai/api/actions/run  action=find_related
// - "Write acceptance criteria" → POST /ai/api/actions/run  action=write_ac
// - Free-form prompt      → POST /ai/api/agents/{defaultAgentId}/execute
//
// All responses streamed via SSE, displayed as Markdown in a scrollable panel.
```

**Payload contract for quick actions:**

```json
POST /api/actions/run
{
  "action": "summarize_task",
  "context": {
    "project_id": "proj-123",
    "task_id": "task-456",
    "task_title": "Fix login bug",
    "task_description": "...",
    "comments": ["...", "..."]
  }
}
```

---

### 5.5 Board-Level AI Sprint Analysis

**File:** `frontend/src/pages/BoardPage.tsx`

Add a floating "AI Analyze Sprint" button (top-right of the board). On click:

1. Collect all tasks in the active sprint from the current board state
2. `POST /api/actions/run` with `action=analyze_sprint` and task list as context
3. SSE-stream the response into a dismissible overlay card on the board

**Overlay card shows:**

- At-risk tasks (blocked / overdue)
- Workload imbalance warnings
- Suggested re-assignments
- Sprint completion probability estimate

---

## 6. Phase 3 — Deep Feature Integration

### 6.1 AI Auto-Triage on Task Create

When a task is created in HRS-JIRA, optionally trigger an AI analysis.

**Flow:**

```
User creates task (POST /projects/{id}/tasks)
  → Spring Boot saves task
  → Spring Boot fires async event: ApplicationEventPublisher.publishEvent(TaskCreatedEvent)
  → TaskAITriggerListener picks up event
  → Calls POST http://ai:8000/api/actions/run  { action: "triage_task", ... }
  → FastAPI AI service responds with suggestions JSON (not SSE, just JSON)
  → Spring Boot stores suggestions in new table: ai_suggestions
  → SSE pushed to frontend via /projects/{id}/sse
  → Frontend TaskModal shows suggestion banner (non-blocking)
```

**New Spring Boot files:**

```
entity/AISuggestion.java
repository/AISuggestionRepository.java
service/AITriggerService.java         ← calls FastAPI /api/actions/run
event/TaskCreatedEvent.java
listener/TaskAITriggerListener.java
controller/AISuggestionController.java  ← GET /projects/{id}/tasks/{taskId}/ai-suggestions
```

**New Flyway migration:** `V12__add_ai_suggestions.sql`

```sql
CREATE TABLE ai_suggestions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,   -- 'triage', 'acceptance_criteria', etc.
  content      JSONB NOT NULL,
  accepted     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_suggestions_task ON ai_suggestions(task_id);
```

---

### 6.2 AI Actor in Activity Log

All actions taken by an AI agent in HRS-JIRA must appear in the activity feed with an "AI" badge.

**Changes to Spring Boot:**

1. Add `actor_type` column to `activity_events` table:

```sql
-- V13__activity_actor_type.sql
ALTER TABLE activity_events ADD COLUMN actor_type VARCHAR(20) DEFAULT 'HUMAN';
```

2. In `ActivityService.java`, propagate `actorType` (HUMAN or AI_AGENT).

3. `AITriggerService.java` passes `X-Actor-Type: AI_AGENT` header when calling Spring Boot endpoints on behalf of an agent.

4. Spring Boot reads this header (only from internal `ai` service — validated by checking request origin IP against the Docker network CIDR) and sets `actor_type = 'AI_AGENT'` in the activity record.

**Frontend `ActivityFeed.tsx`:**

```tsx
{
  event.actorType === "AI_AGENT" && (
    <span className="ml-1 px-1 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
      AI
    </span>
  );
}
```

---

### 6.3 Notification Bridge

When an AI agent execution completes and it affected a HRS-JIRA task, send a notification to the task assignee.

**FastAPI side** — after successful execution, call:

```
POST http://api:4000/internal/notifications
X-Internal-Secret: ${INTERNAL_SECRET}
{
  "userId": "user-uuid",
  "type": "AI_AGENT_COMPLETED",
  "relatedId": "task-uuid",
  "message": "AI Agent completed analysis on TASK-42"
}
```

**Spring Boot side** — new internal endpoint (only accessible within Docker network):

```java
@RestController
@RequestMapping("/internal")
public class InternalController {

    @PostMapping("/notifications")
    public ResponseEntity<Void> createNotification(
            @RequestHeader("X-Internal-Secret") String secret,
            @RequestBody InternalNotificationDto dto) {
        // Validate secret matches INTERNAL_SECRET env var
        // Create notification record
        // Push via SSE to user
        return ResponseEntity.ok().build();
    }
}
```

**New env var:** `INTERNAL_SECRET=<random-32-char-string>` shared between both services.

---

### 6.4 Persona → Project Member Mapping

Link HRS.AI Personas to HRS-JIRA project members by role.

**New table in HRS.AI SQLite (Alembic migration):**

```sql
CREATE TABLE persona_project_links (
  id          TEXT PRIMARY KEY,
  persona_id  TEXT NOT NULL REFERENCES personas(id),
  project_id  TEXT NOT NULL,   -- HRS-JIRA project UUID
  user_id     TEXT NOT NULL,   -- HRS-JIRA user UUID
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**New FastAPI endpoint:**

```
POST /api/personas/{personaId}/link-project
{ "project_id": "...", "user_id": "..." }

GET  /api/personas/{personaId}/linked-projects
```

When an agent runs inside a project context, the adapter automatically scopes tool calls to the linked `project_id` and uses the linked `user_id`'s token.

---

## 7. Phase 4 — Polish & Hardening

### 7.1 Unified Dark Mode

HRS-JIRA uses `useDarkMode.ts` hook that toggles a `dark` class on `<html>`.

All merged AI pages must import and use the same hook. Replace any HRS.AI standalone dark mode logic.

**In every merged AI page:**

```tsx
import { useDarkMode } from "../../hooks/useDarkMode";
// No other dark mode setup needed — Tailwind JIT + dark: prefix handles the rest
```

---

### 7.2 Shared Component Library

Port these HRS.AI UI primitives into HRS-JIRA's component system:

| HRS.AI Component | Target Location                | Notes                                      |
| ---------------- | ------------------------------ | ------------------------------------------ |
| `StatusBadge`    | `components/StatusBadge.tsx`   | Merge with existing `LabelChip` patterns   |
| `KPICard`        | `components/KPICard.tsx`       | Used by DashboardPage and AI analytics     |
| `Spinner`        | Already exists in HRS-JIRA     | Use existing                               |
| `StreamingText`  | `components/StreamingText.tsx` | New — renders SSE token stream as Markdown |

---

### 7.3 API Reference Page Update

**File:** `frontend/src/pages/ApiReferencePage.tsx`

Add an "AI Service" section documenting the FastAPI endpoints:

- Auth passthrough (same JWT)
- Agent execution endpoints
- Collaboration endpoints
- Skill generation endpoints
- Action run endpoint

---

### 7.4 Rate Limiting on FastAPI

Add middleware to prevent runaway agent loops eating AWS Bedrock quota.

```python
# HRS_AI/backend/app/middleware/rate_limit.py
from collections import defaultdict
import time

RATE_LIMITS = {
    "/api/agents/{agent_id}/execute": (5, 60),    # 5 requests per 60s per user
    "/api/collaborations/{id}/run":   (2, 60),    # 2 per 60s per user
    "/api/skills/generate":           (10, 60),   # 10 per 60s per user
}
```

---

### 7.5 Health Check Endpoint

**FastAPI** — add to `main.py`:

```python
@app.get("/health")
async def health():
    return {"status": "ok", "service": "hrs-ai"}
```

**Docker Compose** — add healthcheck:

```yaml
ai:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 10s
    timeout: 5s
    retries: 5
```

---

## 8. Environment & Configuration

### `.env` (root) — complete reference

```bash
# ── PostgreSQL ──────────────────────────────────
POSTGRES_USER=taskflow
POSTGRES_PASSWORD=taskflow
POSTGRES_DB=taskflow
POSTGRES_PORT=5432

# ── Spring Boot ─────────────────────────────────
JWT_SECRET=<min-32-char-random-string>        # SHARED with FastAPI
API_PORT=4000
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── AWS (shared by Spring Boot S3 + FastAPI Bedrock) ──
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=

# ── S3 Attachments (Spring Boot) ────────────────
S3_BUCKET=taskflow-attachments

# ── AWS Bedrock (FastAPI) ────────────────────────
BEDROCK_MODEL_ID=eu.anthropic.claude-sonnet-4-5-20250929-v1:0

# ── Internal service auth ───────────────────────
INTERNAL_SECRET=<min-32-char-random-string>

# ── Frontend build ───────────────────────────────
VITE_API_URL=http://localhost:4000
VITE_AI_URL=http://localhost:8000
```

---

## 9. API Contract Reference

### 9.1 Token Flow

```
1. User logs in via POST /auth/login  (Spring Boot)
2. Spring Boot returns { access_token, refresh_token }
3. Frontend stores access_token in Zustand (authStore)
4. All calls to both :4000 and :8000 use the same Bearer token
5. FastAPI validates the token using the shared JWT_SECRET (no network call)
```

### 9.2 AI Service Endpoints (FastAPI :8000)

All endpoints require `Authorization: Bearer <jwt>`.

```
# Auth (passthrough — same JWT as Spring Boot)
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

# Agent execution
GET    /api/agents
POST   /api/agents
GET    /api/agents/{id}
POST   /api/agents/{id}/execute          ← SSE streamed
GET    /api/agents/{id}/executions
GET    /api/agents/executions/{execId}
POST   /api/agents/executions/{execId}/approve

# Multi-agent collaboration
GET    /api/collaborations
POST   /api/collaborations
GET    /api/collaborations/{id}
POST   /api/collaborations/{id}/run?token=<jwt>   ← SSE streamed

# Skill files
GET    /api/skills
POST   /api/skills/generate/{personaId}  ← SSE streamed
PATCH  /api/skills/{id}/status

# Personas & Departments
GET    /api/personas
GET    /api/departments

# Quick actions (no agent setup needed)
POST   /api/actions/run                  ← JSON response (not SSE)

# Analytics
GET    /api/analytics/dashboard
GET    /api/analytics/executions

# Internal (Docker network only)
POST   /internal/notifications           ← X-Internal-Secret header
```

### 9.3 Action Types for `/api/actions/run`

| `action`            | Description                            | Required context fields                                   |
| ------------------- | -------------------------------------- | --------------------------------------------------------- |
| `summarize_task`    | Summarize task + all comments          | `task_id`, `task_title`, `task_description`, `comments[]` |
| `generate_subtasks` | Suggest N subtasks for a story         | `task_id`, `task_title`, `task_description`, `n`          |
| `find_related`      | Find semantically similar tasks        | `task_id`, `task_title`, `project_id`                     |
| `write_ac`          | Write acceptance criteria              | `task_id`, `task_title`, `task_description`               |
| `triage_task`       | Suggest priority, labels, story points | `task_id`, `task_title`, `task_description`               |
| `analyze_sprint`    | Sprint health analysis                 | `sprint_id`, `tasks[]`                                    |

---

## 10. Database Schema Changes

### 10.1 Spring Boot (PostgreSQL) — New Migrations

**V12\_\_add_ai_suggestions.sql**

```sql
CREATE TABLE ai_suggestions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  content      JSONB NOT NULL,
  accepted     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_suggestions_task ON ai_suggestions(task_id);
```

**V13\_\_activity_actor_type.sql**

```sql
ALTER TABLE activity_events
  ADD COLUMN actor_type VARCHAR(20) NOT NULL DEFAULT 'HUMAN';

CREATE INDEX idx_activity_actor_type ON activity_events(actor_type);
```

### 10.2 HRS.AI (SQLite) — New Alembic Migration

**`alembic/versions/002_persona_project_links.py`**

```python
def upgrade():
    op.create_table(
        "persona_project_links",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("persona_id", sa.String, sa.ForeignKey("personas.id")),
        sa.Column("project_id", sa.String, nullable=False),
        sa.Column("user_id", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
```

---

## 11. Security Considerations

| Concern                          | Mitigation                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Shared JWT secret**            | Use a strong random 64-char secret. Rotate via env var without code changes.                                                       |
| **Internal endpoint abuse**      | `/internal/*` endpoints validated with `INTERNAL_SECRET` header. Docker network restricts external access.                         |
| **Agent acting as user**         | AI tool calls carry the user's own JWT — agents can only do what the user can do.                                                  |
| **Bedrock cost runaway**         | Rate limiting middleware on all SSE-producing endpoints.                                                                           |
| **SQL injection in AI queries**  | All HRS-JIRA queries go through Spring Data JPA (parameterized). FastAPI uses SQLAlchemy ORM.                                      |
| **SSRF via agent tools**         | Tool dispatch whitelist — agents can only call the registered `TOOL_DISPATCH` functions, not arbitrary URLs.                       |
| **LLM prompt injection**         | Task titles/descriptions are passed as user-role messages, never injected into system prompts directly. System prompts are static. |
| **Sensitive data in AI context** | Only task metadata passed to Claude — never passwords, tokens, or PII beyond what's already in the task.                           |

---

## 12. Testing Strategy

### Unit Tests

| Layer                         | What to test                                      |
| ----------------------------- | ------------------------------------------------- |
| `hrsjira_adapter.py`          | Mock httpx, assert correct endpoint called        |
| `AITriggerService.java`       | Mock RestTemplate/WebClient, assert payload shape |
| `AISuggestionController.java` | MockMvc, assert 200/404 responses                 |
| `InternalController.java`     | Assert secret validation rejects wrong headers    |

### Integration Tests

1. **Docker Compose integration:** `docker compose up` all 4 services, run health checks
2. **Token passthrough:** Login via Spring Boot → use token to call FastAPI → assert 200
3. **End-to-end action:** POST `/api/actions/run` with `summarize_task`, mock Bedrock with localstack or a stub, assert streaming response

### Frontend Tests (Vitest + Testing Library)

1. `AIPanel.tsx` — renders, sends correct request, displays streamed text
2. `AgentsPage.tsx` — renders agent list from mock AI API
3. `ProjectSidebar.tsx` — AI section links render correctly

### Manual QA Checklist

- [ ] Existing HRS-JIRA features unaffected after integration
- [ ] Dark mode applied consistently on all AI pages
- [ ] SSE streaming works in Chrome, Firefox, Safari
- [ ] AI suggestion banner appears after task creation
- [ ] Agent execution steps appear in real-time
- [ ] Activity feed shows "AI" badge for AI-driven actions
- [ ] Notification delivered when agent completes

---

## Implementation Timeline

| Phase                        | Scope                                    | Estimated Effort |
| ---------------------------- | ---------------------------------------- | ---------------- |
| **Phase 1** — Foundation     | Docker, auth, API adapter                | ~2–3 days        |
| **Phase 2** — UI Integration | AI pages, panel, sidebar                 | ~3–4 days        |
| **Phase 3** — Deep Features  | Auto-triage, activity, notifications     | ~4–5 days        |
| **Phase 4** — Polish         | Dark mode, components, rate limits, docs | ~1–2 days        |
| **Total**                    |                                          | **~10–14 days**  |
