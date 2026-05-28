from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.db import Agent, Department, DeptKPI, Organization, Persona
from app.schemas.all import DepartmentDetail, DepartmentOut

router = APIRouter()


class DepartmentCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#6366f1"
    icon: str = "Building2"
    organization_id: int


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(selectinload(Department.kpis))
    )
    departments = result.scalars().all()

    response = []
    for dept in departments:
        # Count personas
        persona_count_result = await db.execute(
            select(func.count()).select_from(Persona).where(Persona.department_id == dept.id)
        )
        persona_count = persona_count_result.scalar() or 0

        # Count agents via personas
        agent_count_result = await db.execute(
            select(func.count())
            .select_from(Agent)
            .join(Persona, Agent.persona_id == Persona.id)
            .where(Persona.department_id == dept.id)
        )
        agent_count = agent_count_result.scalar() or 0

        response.append({
            "id": dept.id,
            "name": dept.name,
            "description": dept.description,
            "color": dept.color,
            "icon": dept.icon,
            "organization_id": dept.organization_id,
            "kpis": [
                {
                    "id": k.id,
                    "name": k.name,
                    "value": k.value,
                    "target": k.target,
                    "unit": k.unit,
                    "trend": k.trend,
                }
                for k in dept.kpis
            ],
            "persona_count": persona_count,
            "agent_count": agent_count,
        })

    return response


@router.get("/{dept_id}", response_model=Any)
async def get_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.kpis), selectinload(Department.personas))
        .where(Department.id == dept_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    return {
        "id": dept.id,
        "name": dept.name,
        "description": dept.description,
        "color": dept.color,
        "icon": dept.icon,
        "organization_id": dept.organization_id,
        "kpis": [
            {
                "id": k.id,
                "name": k.name,
                "value": k.value,
                "target": k.target,
                "unit": k.unit,
                "trend": k.trend,
            }
            for k in dept.kpis
        ],
        "personas": [
            {
                "id": p.id,
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
                "avatar_initials": p.avatar_initials,
                "avatar_color": p.avatar_color,
                "department_id": p.department_id,
            }
            for p in dept.personas
        ],
    }


@router.post("", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    dept = Department(
        name=body.name,
        description=body.description,
        color=body.color,
        icon=body.icon,
        organization_id=body.organization_id,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.put("/{dept_id}", response_model=DepartmentOut)
async def update_department(
    dept_id: int,
    body: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if body.name is not None:
        dept.name = body.name
    if body.description is not None:
        dept.description = body.description
    if body.color is not None:
        dept.color = body.color
    if body.icon is not None:
        dept.icon = body.icon

    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept
