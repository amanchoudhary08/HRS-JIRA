from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import ActionTemplate, Agent, Persona, SkillFile
from app.schemas.all import PersonaCreate, PersonaOut

router = APIRouter()


@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_personas(
    department_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    query = select(Persona).options(selectinload(Persona.skill_file))
    if department_id is not None:
        query = query.where(Persona.department_id == department_id)

    result = await db.execute(query)
    personas = result.scalars().all()

    response = []
    for p in personas:
        skill_status = None
        if p.skill_file:
            skill_status = p.skill_file.status.value if hasattr(p.skill_file.status, "value") else str(p.skill_file.status)

        response.append({
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "description": p.description,
            "responsibilities": p.responsibilities or [],
            "data_access": p.data_access or [],
            "processes": p.processes or [],
            "avatar_initials": p.avatar_initials,
            "avatar_color": p.avatar_color,
            "department_id": p.department_id,
            "skill_status": skill_status,
        })

    return response


@router.get("/{slug}", response_model=Any)
async def get_persona(
    slug: str,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Persona)
        .options(
            selectinload(Persona.skill_file),
            selectinload(Persona.agents),
            selectinload(Persona.action_templates),
            selectinload(Persona.department),
        )
        .where(Persona.slug == slug)
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    skill_file = None
    if persona.skill_file:
        sf = persona.skill_file
        skill_file = {
            "id": sf.id,
            "persona_id": sf.persona_id,
            "content": sf.content,
            "version": sf.version,
            "status": sf.status.value if hasattr(sf.status, "value") else str(sf.status),
            "generated_by": sf.generated_by,
            "reviewed_by": sf.reviewed_by,
            "deployed_at": sf.deployed_at.isoformat() if sf.deployed_at else None,
            "created_at": sf.created_at.isoformat() if sf.created_at else None,
            "updated_at": sf.updated_at.isoformat() if sf.updated_at else None,
        }

    return {
        "id": persona.id,
        "name": persona.name,
        "slug": persona.slug,
        "description": persona.description,
        "responsibilities": persona.responsibilities or [],
        "data_access": persona.data_access or [],
        "processes": persona.processes or [],
        "avatar_initials": persona.avatar_initials,
        "avatar_color": persona.avatar_color,
        "department_id": persona.department_id,
        "department": {
            "id": persona.department.id,
            "name": persona.department.name,
            "color": persona.department.color,
            "icon": persona.department.icon,
        } if persona.department else None,
        "skill_file": skill_file,
        "agents": [
            {
                "id": a.id,
                "name": a.name,
                "status": a.status.value if hasattr(a.status, "value") else str(a.status),
                "last_active": a.last_active.isoformat() if a.last_active else None,
            }
            for a in (persona.agents or [])
        ],
        "action_templates": [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "category": t.category,
            }
            for t in (persona.action_templates or [])
        ],
    }


@router.post("", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
async def create_persona(
    body: PersonaCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    # Check slug uniqueness
    existing = await db.execute(select(Persona).where(Persona.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Persona slug already exists")

    persona = Persona(
        name=body.name,
        slug=body.slug,
        description=body.description,
        responsibilities=body.responsibilities,
        data_access=body.data_access,
        processes=body.processes,
        avatar_initials=body.avatar_initials,
        avatar_color=body.avatar_color,
        department_id=body.department_id,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)

    return PersonaOut(
        id=persona.id,
        name=persona.name,
        slug=persona.slug,
        description=persona.description,
        responsibilities=persona.responsibilities or [],
        data_access=persona.data_access or [],
        processes=persona.processes or [],
        avatar_initials=persona.avatar_initials,
        avatar_color=persona.avatar_color,
        department_id=persona.department_id,
        skill_status=None,
    )


@router.put("/{persona_id}", response_model=PersonaOut)
async def update_persona(
    persona_id: int,
    body: PersonaCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(Persona).options(selectinload(Persona.skill_file)).where(Persona.id == persona_id)
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    persona.name = body.name
    persona.slug = body.slug
    persona.description = body.description
    persona.responsibilities = body.responsibilities
    persona.data_access = body.data_access
    persona.processes = body.processes
    persona.avatar_initials = body.avatar_initials
    persona.avatar_color = body.avatar_color
    persona.department_id = body.department_id

    db.add(persona)
    await db.commit()
    await db.refresh(persona)

    skill_status = None
    if persona.skill_file:
        skill_status = persona.skill_file.status.value if hasattr(persona.skill_file.status, "value") else str(persona.skill_file.status)

    return PersonaOut(
        id=persona.id,
        name=persona.name,
        slug=persona.slug,
        description=persona.description,
        responsibilities=persona.responsibilities or [],
        data_access=persona.data_access or [],
        processes=persona.processes or [],
        avatar_initials=persona.avatar_initials,
        avatar_color=persona.avatar_color,
        department_id=persona.department_id,
        skill_status=skill_status,
    )
