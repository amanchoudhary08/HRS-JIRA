from __future__ import annotations

from typing import Dict, Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import Agent, AgentExecution, AgentStatus, Department, Organization, Persona, SkillFile, SkillFileStatus, ExecutionStatus
from app.schemas.all import OrganizationOut

router = APIRouter()


@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    # Fetch first organization
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()

    dept_count_result = await db.execute(select(func.count()).select_from(Department))
    dept_count = dept_count_result.scalar() or 0

    persona_count_result = await db.execute(select(func.count()).select_from(Persona))
    persona_count = persona_count_result.scalar() or 0

    agent_count_result = await db.execute(select(func.count()).select_from(Agent))
    agent_count = agent_count_result.scalar() or 0

    active_agent_count_result = await db.execute(
        select(func.count()).select_from(Agent).where(Agent.status == AgentStatus.RUNNING)
    )
    active_agent_count = active_agent_count_result.scalar() or 0

    return {
        "organization": {
            "id": org.id if org else None,
            "name": org.name if org else "HRS Group",
            "domain": org.domain if org else "hrs.ai",
            "logo_url": org.logo_url if org else None,
        },
        "departments": dept_count,
        "personas": persona_count,
        "agents": agent_count,
        "active_agents": active_agent_count,
    }


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    active_result = await db.execute(
        select(func.count()).select_from(Agent).where(Agent.status == AgentStatus.RUNNING)
    )
    active_agents = active_result.scalar() or 0

    deployed_result = await db.execute(
        select(func.count()).select_from(SkillFile).where(SkillFile.status == SkillFileStatus.DEPLOYED)
    )
    skill_files_deployed = deployed_result.scalar() or 0

    from datetime import date, datetime
    today_start = datetime.combine(date.today(), datetime.min.time())
    exec_today_result = await db.execute(
        select(func.count()).select_from(AgentExecution).where(AgentExecution.created_at >= today_start)
    )
    executions_today = exec_today_result.scalar() or 0

    return {
        "active_agents": active_agents,
        "skill_files_deployed": skill_files_deployed,
        "executions_today": executions_today,
        "avg_csat": 4.5,
    }
