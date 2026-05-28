from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import (
    Agent,
    AgentExecution,
    AgentStatus,
    Department,
    ExecutionStatus,
    Persona,
    SkillFile,
    SkillFileStatus,
)

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    # Total agents
    total_result = await db.execute(select(func.count()).select_from(Agent))
    total_agents = total_result.scalar() or 0

    # Active agents
    active_result = await db.execute(
        select(func.count()).select_from(Agent).where(Agent.status == AgentStatus.RUNNING)
    )
    active_agents = active_result.scalar() or 0

    # Executions today
    today_start = datetime.combine(date.today(), datetime.min.time())
    exec_today_result = await db.execute(
        select(func.count()).select_from(AgentExecution).where(AgentExecution.created_at >= today_start)
    )
    executions_today = exec_today_result.scalar() or 0

    # Skill deployed pct
    total_sf_result = await db.execute(select(func.count()).select_from(SkillFile))
    total_sf = total_sf_result.scalar() or 0
    deployed_sf_result = await db.execute(
        select(func.count()).select_from(SkillFile).where(SkillFile.status == SkillFileStatus.DEPLOYED)
    )
    deployed_sf = deployed_sf_result.scalar() or 0
    skill_deployed_pct = round((deployed_sf / total_sf * 100) if total_sf > 0 else 0.0, 1)

    # Executions by day (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    exec_result = await db.execute(
        select(AgentExecution).where(AgentExecution.created_at >= thirty_days_ago)
    )
    executions = exec_result.scalars().all()

    day_counts: Dict[str, int] = defaultdict(int)
    for ex in executions:
        if ex.created_at:
            day_key = ex.created_at.strftime("%Y-%m-%d")
            day_counts[day_key] += 1

    executions_by_day = [
        {"date": k, "count": v}
        for k, v in sorted(day_counts.items())
    ]

    # Skill by dept
    dept_result = await db.execute(
        select(Department).options(
            selectinload(Department.personas).selectinload(Persona.skill_file)
        )
    )
    departments = dept_result.scalars().all()

    skill_by_dept = []
    for dept in departments:
        deployed = 0
        review = 0
        draft = 0
        for persona in (dept.personas or []):
            if persona.skill_file:
                s = persona.skill_file.status
                if s == SkillFileStatus.DEPLOYED:
                    deployed += 1
                elif s == SkillFileStatus.REVIEW or s == SkillFileStatus.APPROVED:
                    review += 1
                else:
                    draft += 1
            else:
                draft += 1
        skill_by_dept.append({
            "department": dept.name,
            "deployed": deployed,
            "review": review,
            "draft": draft,
        })

    # Execution status distribution
    all_exec_result = await db.execute(select(AgentExecution))
    all_executions = all_exec_result.scalars().all()

    status_counts: Dict[str, int] = defaultdict(int)
    for ex in all_executions:
        status_str = ex.status.value if hasattr(ex.status, "value") else str(ex.status)
        status_counts[status_str] += 1

    execution_status_dist = [
        {"status": k, "count": v}
        for k, v in status_counts.items()
    ]

    return {
        "total_agents": total_agents,
        "active_agents": active_agents,
        "executions_today": executions_today,
        "skill_deployed_pct": skill_deployed_pct,
        "executions_by_day": executions_by_day,
        "skill_by_dept": skill_by_dept,
        "execution_status_dist": execution_status_dist,
    }


@router.get("/agent-activity")
async def get_agent_activity(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    result = await db.execute(
        select(AgentExecution).where(AgentExecution.created_at >= thirty_days_ago)
    )
    executions = result.scalars().all()

    day_counts: Dict[str, int] = defaultdict(int)
    for ex in executions:
        if ex.created_at:
            day_key = ex.created_at.strftime("%Y-%m-%d")
            day_counts[day_key] += 1

    return [
        {"date": k, "count": v}
        for k, v in sorted(day_counts.items())
    ]


@router.get("/skill-adoption")
async def get_skill_adoption(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    dept_result = await db.execute(
        select(Department).options(
            selectinload(Department.personas).selectinload(Persona.skill_file)
        )
    )
    departments = dept_result.scalars().all()

    response = []
    for dept in departments:
        total_personas = len(dept.personas or [])
        deployed = 0
        in_review = 0
        draft = 0

        for persona in (dept.personas or []):
            if persona.skill_file:
                s = persona.skill_file.status
                if s == SkillFileStatus.DEPLOYED:
                    deployed += 1
                elif s in (SkillFileStatus.REVIEW, SkillFileStatus.APPROVED):
                    in_review += 1
                else:
                    draft += 1
            else:
                draft += 1

        response.append({
            "department": dept.name,
            "total_personas": total_personas,
            "deployed": deployed,
            "in_review": in_review,
            "draft": draft,
        })

    return response
