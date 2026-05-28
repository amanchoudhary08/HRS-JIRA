from __future__ import annotations

import json
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import (
    CollaborationMessage,
    CollaborationSession,
    CollaborationSessionStatus,
    User,
)
from app.services.auth_service import decode_token
from app.services.collaboration_service import request_cancel, run_collaboration_session

router = APIRouter()


class CollaborationCreate(BaseModel):
    problem_statement: str
    title: Optional[str] = None
    jira_project_key: Optional[str] = None
    confluence_space_key: Optional[str] = None


class CollaborationUpdate(BaseModel):
    title: Optional[str] = None
    problem_statement: Optional[str] = None
    jira_project_key: Optional[str] = None
    confluence_space_key: Optional[str] = None


def _format_session(s: CollaborationSession) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "problem_statement": s.problem_statement,
        "status": s.status.value if hasattr(s.status, "value") else str(s.status),
        "created_by": s.created_by,
        "jira_project_key": s.jira_project_key,
        "confluence_space_key": s.confluence_space_key,
        "orchestrator_plan": s.orchestrator_plan,
        "synthesis_output": s.synthesis_output,
        "agent_outputs": s.agent_outputs,
        "jira_epic": s.jira_epic,
        "confluence_page": s.confluence_page,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _format_message(m: CollaborationMessage) -> dict:
    return {
        "id": m.id,
        "session_id": m.session_id,
        "sequence": m.sequence,
        "role": m.role.value if hasattr(m.role, "value") else str(m.role),
        "agent_id": m.agent_id,
        "agent_name": m.agent_name,
        "persona_name": m.persona_name,
        "content": m.content,
        "tool_name": m.tool_name,
        "tool_input": m.tool_input,
        "tool_result": m.tool_result,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ── SSE auth (EventSource can't send headers) ────────────────────────────────

async def _sse_auth(
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required")
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_collaborations(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(CollaborationSession).order_by(CollaborationSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [_format_session(s) for s in sessions]


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_collaboration(
    body: CollaborationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = CollaborationSession(
        title=body.title or body.problem_statement[:80],
        problem_statement=body.problem_statement,
        jira_project_key=body.jira_project_key,
        confluence_space_key=body.confluence_space_key,
        status=CollaborationSessionStatus.PENDING,
        created_by=current_user.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _format_session(session)


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{session_id}")
async def get_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")

    result = await db.execute(
        select(CollaborationMessage)
        .where(CollaborationMessage.session_id == session_id)
        .order_by(CollaborationMessage.sequence)
    )
    messages = result.scalars().all()

    data = _format_session(session)
    data["messages"] = [_format_message(m) for m in messages]
    return data


# ── Update (title, keys, retry reset) ────────────────────────────────────────

@router.patch("/{session_id}")
async def update_collaboration(
    session_id: int,
    body: CollaborationUpdate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")
    if session.status == CollaborationSessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Cannot update a running session")

    if body.title is not None:
        session.title = body.title
    if body.problem_statement is not None:
        session.problem_statement = body.problem_statement
    if body.jira_project_key is not None:
        session.jira_project_key = body.jira_project_key
    if body.confluence_space_key is not None:
        session.confluence_space_key = body.confluence_space_key

    await db.commit()
    await db.refresh(session)
    return _format_session(session)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")
    if session.status == CollaborationSessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Cannot delete a running session")
    await db.delete(session)
    await db.commit()


# ── Reset (mark failed session as pending to allow re-run) ───────────────────

@router.post("/{session_id}/reset")
async def reset_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")
    if session.status == CollaborationSessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Session is currently running")

    session.status = CollaborationSessionStatus.PENDING
    session.synthesis_output = None
    session.orchestrator_plan = None
    session.agent_outputs = None
    session.jira_epic = None
    session.confluence_page = None

    # Delete existing messages so fresh run starts clean
    existing = await db.execute(
        select(CollaborationMessage).where(CollaborationMessage.session_id == session_id)
    )
    for msg in existing.scalars().all():
        await db.delete(msg)

    await db.commit()
    await db.refresh(session)
    return _format_session(session)


# ── Export to Markdown ────────────────────────────────────────────────────────

@router.get("/{session_id}/export")
async def export_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")

    lines = [
        f"# {session.title}",
        f"\n**Status:** {session.status.value}",
        f"\n**Problem Statement:**\n\n{session.problem_statement}",
    ]

    if session.orchestrator_plan:
        lines.append("\n## Orchestrator Plan\n")
        for item in session.orchestrator_plan:
            lines.append(f"- **{item.get('role_slug', '?')}**: {item.get('task', '')}")

    if session.agent_outputs:
        lines.append("\n## Agent Outputs\n")
        for role, output in session.agent_outputs.items():
            lines.append(f"\n### {role.upper()}\n\n{output}\n")

    if session.synthesis_output:
        lines.append("\n## Synthesis\n")
        lines.append(session.synthesis_output)

    if session.jira_epic and not session.jira_epic.get("error"):
        key = session.jira_epic.get("key", "")
        url = session.jira_epic.get("url", "")
        lines.append(f"\n## Jira Epic\n\n[{key}]({url})")

    if session.confluence_page and not session.confluence_page.get("error"):
        title = session.confluence_page.get("title", "")
        url = session.confluence_page.get("url", "")
        lines.append(f"\n## Confluence Page\n\n[{title}]({url})")

    content = "\n".join(lines)
    filename = session.title.replace(" ", "_").replace("/", "-")[:50]
    return PlainTextResponse(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}.md"'},
    )


# ── Cancel (stop a running session) ──────────────────────────────────────────

@router.post("/{session_id}/cancel")
async def cancel_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")
    if session.status != CollaborationSessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Session is not running")
    request_cancel(session_id)
    # Immediately mark FAILED so UI sees it right away (generator will also exit)
    session.status = CollaborationSessionStatus.FAILED
    await db.commit()
    return {"status": "cancelled", "session_id": session_id}


# ── SSE Run ───────────────────────────────────────────────────────────────────

@router.get("/{session_id}/run")
async def run_collaboration(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_sse_auth),
):
    session = await db.get(CollaborationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Collaboration session not found")

    async def event_generator():
        # Send errors as SSE events (not HTTP errors) so EventSource doesn't auto-retry
        if session.status == CollaborationSessionStatus.RUNNING:
            yield {"data": json.dumps({"type": "error", "message": "Session already running", "code": "already_running"})}
            return
        async for event in run_collaboration_session(session_id, db, created_by=current_user.id):
            yield {"data": json.dumps(event)}

    return EventSourceResponse(event_generator())
