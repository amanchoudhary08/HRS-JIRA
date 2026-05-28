from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.db import Department, Persona, SkillFile, SkillFileStatus, SkillVersion
from app.schemas.all import SkillFileOut, SkillVersionOut
from app.services.ai_service import generate_skill_file_stream

router = APIRouter()


class SkillFileEdit(BaseModel):
    content: str
    changelog: Optional[str] = None


@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_skill_files(
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(SkillFile)
        .options(
            selectinload(SkillFile.persona).selectinload(Persona.department)
        )
    )
    skill_files = result.scalars().all()

    response = []
    for sf in skill_files:
        dept_name = None
        if sf.persona and sf.persona.department:
            dept_name = sf.persona.department.name

        response.append({
            "id": sf.id,
            "persona_id": sf.persona_id,
            "persona_name": sf.persona.name if sf.persona else None,
            "department_name": dept_name,
            "content": sf.content,
            "version": sf.version,
            "status": sf.status.value if hasattr(sf.status, "value") else str(sf.status),
            "generated_by": sf.generated_by,
            "reviewed_by": sf.reviewed_by,
            "deployed_at": sf.deployed_at.isoformat() if sf.deployed_at else None,
            "created_at": sf.created_at.isoformat() if sf.created_at else None,
            "updated_at": sf.updated_at.isoformat() if sf.updated_at else None,
        })

    return response


@router.get("/{persona_id}", response_model=Any)
async def get_skill_file(
    persona_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(SkillFile)
        .options(selectinload(SkillFile.persona))
        .where(SkillFile.persona_id == persona_id)
    )
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    return {
        "id": sf.id,
        "persona_id": sf.persona_id,
        "persona_name": sf.persona.name if sf.persona else None,
        "content": sf.content,
        "version": sf.version,
        "status": sf.status.value if hasattr(sf.status, "value") else str(sf.status),
        "generated_by": sf.generated_by,
        "reviewed_by": sf.reviewed_by,
        "deployed_at": sf.deployed_at.isoformat() if sf.deployed_at else None,
        "created_at": sf.created_at.isoformat() if sf.created_at else None,
        "updated_at": sf.updated_at.isoformat() if sf.updated_at else None,
    }


@router.post("/generate/{persona_id}")
async def generate_skill_file(
    persona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    persona_dict = {
        "name": persona.name,
        "description": persona.description,
        "responsibilities": persona.responsibilities or [],
        "data_access": persona.data_access or [],
        "processes": persona.processes or [],
    }

    # Get skill file or create one
    sf_result = await db.execute(select(SkillFile).where(SkillFile.persona_id == persona_id))
    skill_file = sf_result.scalar_one_or_none()

    if not skill_file:
        skill_file = SkillFile(
            persona_id=persona_id,
            content=None,
            version=1,
            status=SkillFileStatus.DRAFT,
            generated_by=current_user.email,
        )
        db.add(skill_file)
        await db.commit()
        await db.refresh(skill_file)

    skill_file_id = skill_file.id

    async def event_generator():
        collected = []
        try:
            async for chunk in generate_skill_file_stream(persona_dict, []):
                collected.append(chunk)
                yield {
                    "data": json.dumps({"type": "chunk", "content": chunk}),
                }

            full_content = "".join(collected)

            # Save the generated content
            sf_result2 = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
            sf = sf_result2.scalar_one_or_none()
            if sf:
                sf.content = full_content
                sf.generated_by = current_user.email
                db.add(sf)
                await db.commit()

            yield {
                "data": json.dumps({"type": "done", "skill_file_id": skill_file_id}),
            }
        except Exception as exc:
            yield {
                "data": json.dumps({"type": "error", "message": str(exc)}),
            }

    return EventSourceResponse(event_generator())


@router.put("/{skill_file_id}", response_model=Any)
async def update_skill_file(
    skill_file_id: int,
    body: SkillFileEdit,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    result = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    # Create version snapshot before editing
    version_snapshot = SkillVersion(
        skill_file_id=sf.id,
        content=sf.content or "",
        version=sf.version,
        changed_by=current_user.email,
        changelog=body.changelog or f"Edited at version {sf.version}",
    )
    db.add(version_snapshot)

    sf.content = body.content
    sf.version = sf.version + 1
    db.add(sf)
    await db.commit()
    await db.refresh(sf)

    return {
        "id": sf.id,
        "persona_id": sf.persona_id,
        "content": sf.content,
        "version": sf.version,
        "status": sf.status.value if hasattr(sf.status, "value") else str(sf.status),
        "updated_at": sf.updated_at.isoformat() if sf.updated_at else None,
    }


@router.post("/{skill_file_id}/review")
async def submit_for_review(
    skill_file_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    sf.status = SkillFileStatus.REVIEW
    db.add(sf)
    await db.commit()
    return {"status": "REVIEW", "skill_file_id": skill_file_id}


@router.post("/{skill_file_id}/approve")
async def approve_skill_file(
    skill_file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    result = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    sf.status = SkillFileStatus.APPROVED
    sf.reviewed_by = current_user.email
    db.add(sf)
    await db.commit()
    return {"status": "APPROVED", "skill_file_id": skill_file_id, "reviewed_by": current_user.email}


@router.post("/{skill_file_id}/deploy")
async def deploy_skill_file(
    skill_file_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    result = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    sf.status = SkillFileStatus.DEPLOYED
    sf.deployed_at = datetime.utcnow()
    db.add(sf)
    await db.commit()
    return {
        "status": "DEPLOYED",
        "skill_file_id": skill_file_id,
        "deployed_at": sf.deployed_at.isoformat(),
    }


@router.get("/{skill_file_id}/versions", response_model=List[Any])
async def get_skill_versions(
    skill_file_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(
        select(SkillVersion)
        .where(SkillVersion.skill_file_id == skill_file_id)
        .order_by(SkillVersion.version.desc())
    )
    versions = result.scalars().all()

    return [
        {
            "id": v.id,
            "skill_file_id": v.skill_file_id,
            "version": v.version,
            "changed_by": v.changed_by,
            "changelog": v.changelog,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in versions
    ]


@router.post("/{skill_file_id}/rollback/{version}")
async def rollback_skill_version(
    skill_file_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    # Find the version snapshot
    version_result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_file_id == skill_file_id,
            SkillVersion.version == version,
        )
    )
    version_record = version_result.scalar_one_or_none()
    if not version_record:
        raise HTTPException(status_code=404, detail="Version not found")

    # Get the skill file
    sf_result = await db.execute(select(SkillFile).where(SkillFile.id == skill_file_id))
    sf = sf_result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Skill file not found")

    # Create a snapshot of current state before rollback
    snapshot = SkillVersion(
        skill_file_id=sf.id,
        content=sf.content or "",
        version=sf.version,
        changed_by=current_user.email,
        changelog=f"Snapshot before rollback to v{version}",
    )
    db.add(snapshot)

    sf.content = version_record.content
    sf.version = sf.version + 1
    sf.status = SkillFileStatus.DRAFT
    db.add(sf)
    await db.commit()

    return {
        "message": f"Rolled back to version {version}",
        "new_version": sf.version,
        "skill_file_id": skill_file_id,
    }
