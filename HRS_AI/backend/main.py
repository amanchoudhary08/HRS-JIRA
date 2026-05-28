from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)
for _var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"):
    os.environ.pop(_var, None)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_all_tables
from app.routes import auth, org, departments, personas, skills, agents, actions, documents, analytics, websocket, integrations, collaborations


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all_tables()
    await _reset_stuck_sessions()
    Path("uploads").mkdir(exist_ok=True)
    print("\n[HRS.AI] Backend ready on http://localhost:8000")
    print("[HRS.AI] API docs: http://localhost:8000/docs\n")
    yield


async def _reset_stuck_sessions():
    """Reset any sessions/agents left RUNNING from a previous server crash/restart."""
    from app.database import AsyncSessionLocal
    from app.models.db import Agent, AgentStatus, CollaborationSession, CollaborationSessionStatus
    from sqlalchemy import update
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(CollaborationSession)
            .where(CollaborationSession.status == CollaborationSessionStatus.RUNNING)
            .values(status=CollaborationSessionStatus.FAILED)
        )
        await db.execute(
            update(Agent)
            .where(Agent.status == AgentStatus.RUNNING)
            .values(status=AgentStatus.IDLE)
        )
        await db.commit()
    print("[HRS.AI] Cleared any stuck RUNNING collaboration sessions and agents.")


app = FastAPI(title="HRS.AI API", version="1.0.0", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(org.router, prefix="/api/org", tags=["org"])
app.include_router(departments.router, prefix="/api/departments", tags=["departments"])
app.include_router(personas.router, prefix="/api/personas", tags=["personas"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(actions.router, prefix="/api/actions", tags=["actions"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])
app.include_router(collaborations.router, prefix="/api/collaborations", tags=["collaborations"])

uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "HRS.AI API"}
