from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import ActionTemplate, Persona, SkillFile
from app.schemas.all import ActionTemplateOut
from app.services.ai_service import chat_with_persona_stream, run_agent_task_stream

router = APIRouter()


class RunTemplateRequest(BaseModel):
    template_id: int
    input: Dict[str, Any]
    persona_id: Optional[int] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    persona_id: int


@router.get("/templates", response_model=List[Any])
async def list_action_templates(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(ActionTemplate).order_by(ActionTemplate.created_at.desc())
    )
    templates = result.scalars().all()

    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "category": t.category,
            "input_schema": t.input_schema or {},
            "is_global": t.is_global,
            "persona_id": t.persona_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in templates
    ]


@router.post("/run")
async def run_template(
    body: RunTemplateRequest,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(ActionTemplate).where(ActionTemplate.id == body.template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Action template not found")

    # Build execution dict
    execution_dict = {
        "task_name": template.name,
        "input": body.input,
    }

    # Fetch skill content if persona provided
    skill_content = template.prompt or ""
    if body.persona_id:
        sf_result = await db.execute(
            select(SkillFile).where(SkillFile.persona_id == body.persona_id)
        )
        sf = sf_result.scalar_one_or_none()
        if sf and sf.content:
            skill_content = sf.content

    async def event_generator():
        try:
            async for line in run_agent_task_stream(execution_dict, skill_content):
                line = line.strip()
                if not line:
                    continue
                try:
                    step_data = json.loads(line)
                    yield {"data": json.dumps({"type": "step", "step": step_data})}
                except json.JSONDecodeError:
                    yield {"data": json.dumps({"type": "chunk", "content": line})}
        except Exception as exc:
            yield {"data": json.dumps({"type": "error", "message": str(exc)})}
        finally:
            yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())


@router.post("/chat")
async def chat_with_persona(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Persona)
        .options(selectinload(Persona.skill_file))
        .where(Persona.id == body.persona_id)
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    persona_dict = {
        "name": persona.name,
        "description": persona.description,
        "responsibilities": persona.responsibilities or [],
    }

    skill_content = ""
    if persona.skill_file and persona.skill_file.content:
        skill_content = persona.skill_file.content

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def event_generator():
        try:
            async for chunk in chat_with_persona_stream(messages, persona_dict, skill_content):
                yield {"data": json.dumps({"type": "chunk", "content": chunk})}
        except Exception as exc:
            yield {"data": json.dumps({"type": "error", "message": str(exc)})}
        finally:
            yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())
