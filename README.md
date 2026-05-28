# HRS TaskFlow — JIRA-style Project Management

A full-stack project management tool built with **Spring Boot 3.5**, **React 18 + TypeScript**, and **PostgreSQL 16**, containerised with Docker Compose.

---

## Prerequisites

| Tool                    | Version |
| ----------------------- | ------- |
| Docker & Docker Compose | 24+     |
| Java (for local dev)    | 17+     |
| Node.js (for local dev) | 20+     |

---

## Quick start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd HRS-JIRA

# 2. Copy and configure environment variables
cp .env.example .env   # or edit the existing .env
#    Set JWT_SECRET, INTERNAL_SECRET, and optionally Google OAuth credentials

# 3. Start all services
docker compose up --build

# 4. Open the app
open http://localhost:3000
```

The API is available at `http://localhost:4000`.

---

## Environment variables (`.env`)

| Variable               | Required | Description                                                 |
| ---------------------- | -------- | ----------------------------------------------------------- |
| `JWT_SECRET`           | ✅       | ≥32-char secret for signing JWTs                            |
| `INTERNAL_SECRET`      | ✅       | ≥32-char secret for internal service calls                  |
| `POSTGRES_USER`        | optional | DB user (default: `taskflow`)                               |
| `POSTGRES_PASSWORD`    | optional | DB password (default: `taskflow`)                           |
| `POSTGRES_DB`          | optional | DB name (default: `taskflow`)                               |
| `GOOGLE_CLIENT_ID`     | optional | Google OAuth2 client ID                                     |
| `GOOGLE_CLIENT_SECRET` | optional | Google OAuth2 client secret                                 |
| `VITE_API_URL`         | optional | API base URL seen by the browser                            |
| `FRONTEND_URL`         | optional | Frontend origin for CORS (default: `http://localhost:3000`) |
| `S3_BUCKET`            | optional | AWS S3 bucket for file attachments                          |
| `AWS_REGION`           | optional | AWS region (default: `us-east-1`)                           |
| `MAIL_HOST`            | optional | SMTP host for email digests                                 |
| `MAIL_ENABLED`         | optional | Set `true` to enable email digest (default: `false`)        |

---

## Test credentials (seeded)

| Role      | Email                  | Password   |
| --------- | ---------------------- | ---------- |
| Admin     | `admin@taskflow.local` | `password` |
| Demo user | `demo@taskflow.local`  | `password` |

---

## Local development (without Docker)

```bash
# Backend — requires a running PostgreSQL on port 5432
cd backend
./mvnw spring-boot:run

# Frontend
cd frontend
npm install
npm run dev   # Vite dev server on http://localhost:5173
```

---

## Key API endpoints

| Method | Path                    | Description                             |
| ------ | ----------------------- | --------------------------------------- |
| POST   | `/auth/register`        | Register a new user                     |
| POST   | `/auth/login`           | Log in, receive JWT                     |
| GET    | `/auth/sse-token`       | Get a short-lived SSE-scoped token      |
| GET    | `/projects`             | List accessible projects                |
| POST   | `/projects`             | Create a project                        |
| GET    | `/projects/:id`         | Project detail + recent tasks           |
| GET    | `/projects/:id/tasks`   | Paginated task list with filters        |
| GET    | `/search?q=`            | Global full-text search across projects |
| GET    | `/projects/:id/events`  | SSE stream for real-time task events    |
| GET    | `/notifications/events` | SSE stream for personal notifications   |

Full interactive docs are available in the app at **Settings → API Reference**.

---

## Running tests

```bash
cd backend
./mvnw test
```

---

## Architecture

```
browser → Nginx (port 3000) → React SPA
                          ↕ REST / SSE
                   Spring Boot API (port 4000)
                          ↕ JDBC
                   PostgreSQL 16 (port 5432)
```

Real-time updates use **Server-Sent Events (SSE)**. File attachments are stored in **AWS S3**. AI triage suggestions are fetched asynchronously from an external FastAPI service configured via `AI_URL`.
