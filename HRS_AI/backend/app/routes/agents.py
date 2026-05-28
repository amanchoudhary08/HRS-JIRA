from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import (
    Agent,
    AgentExecution,
    AgentStatus,
    ExecutionStatus,
    ExecutionStep,
    Persona,
    Department,
)
from app.schemas.all import AgentCreate, AgentExecutionOut, AgentOut, ExecutionCreate
from app.services.agent_service import (
    create_execution,
    get_skill_content_for_agent,
    save_execution_step,
    update_agent_status,
    update_execution_status,
)
from app.services.ai_service import run_agent_task_stream

router = APIRouter()

# In-memory cancellation flags for agent executions
_execution_cancel_flags: set[int] = set()


@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent)
        .options(
            selectinload(Agent.persona).selectinload(Persona.department)
        )
    )
    agents = result.scalars().all()

    response = []
    for a in agents:
        dept_name = None
        if a.persona and a.persona.department:
            dept_name = a.persona.department.name

        response.append({
            "id": a.id,
            "name": a.name,
            "persona_id": a.persona_id,
            "persona_name": a.persona.name if a.persona else None,
            "department_name": dept_name,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
            "last_active": a.last_active.isoformat() if a.last_active else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return response


@router.get("/executions/all", response_model=List[Any])
async def list_all_executions(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(AgentExecution)
        .options(
            selectinload(AgentExecution.agent).selectinload(Agent.persona),
            selectinload(AgentExecution.steps),
        )
        .order_by(AgentExecution.created_at.desc())
    )
    executions = result.scalars().all()

    return [_format_execution(ex) for ex in executions]


@router.get("/{agent_id}", response_model=Any)
async def get_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent)
        .options(
            selectinload(Agent.persona).selectinload(Persona.department),
            selectinload(Agent.executions).selectinload(AgentExecution.steps),
        )
        .where(Agent.id == agent_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    dept_name = None
    if agent.persona and agent.persona.department:
        dept_name = agent.persona.department.name

    return {
        "id": agent.id,
        "name": agent.name,
        "persona_id": agent.persona_id,
        "persona_name": agent.persona.name if agent.persona else None,
        "department_name": dept_name,
        "status": agent.status.value if hasattr(agent.status, "value") else str(agent.status),
        "last_active": agent.last_active.isoformat() if agent.last_active else None,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "executions": [_format_execution(ex) for ex in (agent.executions or [])],
    }


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    agent = Agent(
        name=body.name,
        persona_id=body.persona_id,
        status=AgentStatus.IDLE,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.post("/{agent_id}/execute")
async def execute_agent(
    agent_id: int,
    body: ExecutionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    execution = await create_execution(db, agent_id, body.task_name, body.input)
    execution_id = execution.id

    skill_content = await get_skill_content_for_agent(db, agent_id)

    execution_dict = {
        "task_name": body.task_name,
        "input": body.input,
    }

    await update_agent_status(db, agent_id, AgentStatus.RUNNING)
    _execution_cancel_flags.discard(execution_id)

    async def event_generator():
        final_status = ExecutionStatus.COMPLETED
        try:
            step_count = 0
            async for line in run_agent_task_stream(execution_dict, skill_content):
                if execution_id in _execution_cancel_flags:
                    final_status = ExecutionStatus.FAILED
                    yield {"data": json.dumps({"type": "cancelled", "message": "Stopped by user"})}
                    return

                line = line.strip()
                if not line:
                    continue

                try:
                    step_data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                step_count += 1
                step_status = step_data.get("status", "completed")
                requires_approval = step_data.get("requires_approval", False)

                if requires_approval or step_status == "awaiting_approval":
                    final_status = ExecutionStatus.AWAITING_APPROVAL

                await save_execution_step(
                    db,
                    execution_id=execution_id,
                    step_number=step_data.get("step", step_count),
                    action=step_data.get("action", ""),
                    reasoning=step_data.get("reasoning", ""),
                    result=step_data.get("result", ""),
                    status=step_status,
                )

                yield {
                    "data": json.dumps({
                        "type": "step",
                        "step": step_data,
                        "execution_id": execution_id,
                    }),
                }

        except Exception as exc:
            final_status = ExecutionStatus.FAILED
            yield {
                "data": json.dumps({"type": "error", "message": str(exc)}),
            }
        finally:
            _execution_cancel_flags.discard(execution_id)
            ex_result = await db.execute(select(AgentExecution).where(AgentExecution.id == execution_id))
            ex = ex_result.scalar_one_or_none()
            if ex:
                await update_execution_status(db, ex, final_status)

            await update_agent_status(db, agent_id, AgentStatus.IDLE)

            yield {
                "data": json.dumps({
                    "type": "done",
                    "execution_id": execution_id,
                    "status": final_status.value if hasattr(final_status, "value") else str(final_status),
                }),
            }

    return EventSourceResponse(event_generator())


@router.post("/executions/{execution_id}/cancel")
async def cancel_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(select(AgentExecution).where(AgentExecution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if execution.status not in (ExecutionStatus.RUNNING, ExecutionStatus.PENDING):
        raise HTTPException(status_code=409, detail="Execution is not running")
    # Set flag so the running generator exits on next iteration
    _execution_cancel_flags.add(execution_id)
    # Immediately mark FAILED in DB so UI sees it right away
    execution.status = ExecutionStatus.FAILED
    execution.completed_at = datetime.utcnow()
    db.add(execution)
    await db.commit()
    return {"status": "cancelled", "execution_id": execution_id}


@router.get("/{agent_id}/executions", response_model=List[Any])
async def get_agent_executions(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(AgentExecution)
        .options(selectinload(AgentExecution.steps))
        .where(AgentExecution.agent_id == agent_id)
        .order_by(AgentExecution.created_at.desc())
    )
    executions = result.scalars().all()
    return [_format_execution(ex) for ex in executions]


@router.post("/executions/{execution_id}/approve")
async def approve_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    result = await db.execute(select(AgentExecution).where(AgentExecution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    execution.status = ExecutionStatus.APPROVED
    execution.approved_by = current_user.email
    execution.approved_at = datetime.utcnow()
    db.add(execution)
    await db.commit()

    return {
        "status": "APPROVED",
        "execution_id": execution_id,
        "approved_by": current_user.email,
        "approved_at": execution.approved_at.isoformat(),
    }


@router.post("/executions/{execution_id}/reject")
async def reject_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    result = await db.execute(select(AgentExecution).where(AgentExecution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    execution.status = ExecutionStatus.REJECTED
    execution.approved_by = current_user.email
    execution.approved_at = datetime.utcnow()
    execution.completed_at = datetime.utcnow()
    db.add(execution)
    await db.commit()

    return {"status": "REJECTED", "execution_id": execution_id}


def _format_execution(ex: AgentExecution) -> dict:
    agent_name = None
    persona_name = None
    if hasattr(ex, "agent") and ex.agent:
        agent_name = ex.agent.name
        if ex.agent.persona:
            persona_name = ex.agent.persona.name

    return {
        "id": ex.id,
        "agent_id": ex.agent_id,
        "agent_name": agent_name,
        "persona_name": persona_name,
        "task_name": ex.task_name,
        "input": ex.input,
        "output": ex.output,
        "status": ex.status.value if hasattr(ex.status, "value") else str(ex.status),
        "started_at": ex.started_at.isoformat() if ex.started_at else None,
        "completed_at": ex.completed_at.isoformat() if ex.completed_at else None,
        "approved_by": ex.approved_by,
        "approved_at": ex.approved_at.isoformat() if ex.approved_at else None,
        "created_at": ex.created_at.isoformat() if ex.created_at else None,
        "steps": [
            {
                "id": s.id,
                "execution_id": s.execution_id,
                "step_number": s.step_number,
                "action": s.action,
                "reasoning": s.reasoning,
                "result": s.result,
                "status": s.status,
                "duration_ms": s.duration_ms,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in (ex.steps or [])
        ],
    }
