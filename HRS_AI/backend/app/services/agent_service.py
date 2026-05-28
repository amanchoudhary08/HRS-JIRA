from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import (
    Agent,
    AgentExecution,
    AgentStatus,
    ExecutionStatus,
    ExecutionStep,
    Persona,
    SkillFile,
)
from app.services.ai_service import run_agent_task_stream


async def create_execution(
    db: AsyncSession,
    agent_id: int,
    task_name: str,
    input_data: Dict[str, Any],
) -> AgentExecution:
    execution = AgentExecution(
        agent_id=agent_id,
        task_name=task_name,
        input=input_data,
        status=ExecutionStatus.PENDING,
        started_at=datetime.utcnow(),
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    return execution


async def get_skill_content_for_agent(db: AsyncSession, agent_id: int) -> str:
    result = await db.execute(
        select(SkillFile)
        .join(Persona, SkillFile.persona_id == Persona.id)
        .join(Agent, Agent.persona_id == Persona.id)
        .where(Agent.id == agent_id)
    )
    skill = result.scalar_one_or_none()
    return skill.content if skill and skill.content else ""


async def save_execution_step(
    db: AsyncSession,
    execution_id: int,
    step_number: int,
    action: str,
    reasoning: str,
    result: str,
    status: str,
    duration_ms: int = None,
) -> ExecutionStep:
    step = ExecutionStep(
        execution_id=execution_id,
        step_number=step_number,
        action=action,
        reasoning=reasoning,
        result=result,
        status=status,
        duration_ms=duration_ms,
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return step


async def update_execution_status(
    db: AsyncSession,
    execution: AgentExecution,
    new_status: ExecutionStatus,
    output: Dict[str, Any] = None,
) -> AgentExecution:
    execution.status = new_status
    if output is not None:
        execution.output = output
    if new_status in (ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.REJECTED):
        execution.completed_at = datetime.utcnow()
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    return execution


async def update_agent_status(
    db: AsyncSession,
    agent_id: int,
    new_status: AgentStatus,
) -> None:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent:
        agent.status = new_status
        agent.last_active = datetime.utcnow()
        db.add(agent)
        await db.commit()
