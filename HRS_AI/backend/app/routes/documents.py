from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.db import ProcessDocument
from app.schemas.all import ProcessDocumentOut

router = APIRouter()

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)


class DocumentCreate(BaseModel):
    title: str
    department: Optional[str] = None
    category: str = "general"
    content: str
    tags: Optional[List[str]] = None


@router.get("", response_model=List[Any])
@router.get("/", response_model=List[Any])
async def list_documents(
    department: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    query = select(ProcessDocument).order_by(ProcessDocument.updated_at.desc())
    if department:
        query = query.where(ProcessDocument.department == department)
    if category:
        query = query.where(ProcessDocument.category == category)

    result = await db.execute(query)
    docs = result.scalars().all()

    return [_format_doc(d) for d in docs]


@router.get("/{doc_id}", response_model=Any)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    result = await db.execute(select(ProcessDocument).where(ProcessDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _format_doc(doc)


@router.post("", response_model=Any, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=Any, status_code=status.HTTP_201_CREATED)
async def create_document(
    body: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    doc = ProcessDocument(
        title=body.title,
        department=body.department,
        category=body.category,
        content=body.content,
        tags=body.tags or [],
        version=1,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _format_doc(doc)


@router.post("/upload", response_model=Any, status_code=status.HTTP_201_CREATED)
async def upload_document(
    title: str = Form(...),
    department: Optional[str] = Form(None),
    category: str = Form("general"),
    tags: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    # Save file to uploads directory
    ext = Path(file.filename).suffix if file.filename else ""
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / unique_filename

    async with aiofiles.open(file_path, "wb") as f:
        content_bytes = await file.read()
        await f.write(content_bytes)

    file_url = f"/uploads/{unique_filename}"

    # Attempt text extraction
    extracted_content = ""
    try:
        if ext.lower() in (".txt", ".md", ".csv", ".json", ".xml", ".html"):
            extracted_content = content_bytes.decode("utf-8", errors="ignore")
        else:
            extracted_content = f"[Binary file: {file.filename}. Content extraction not available for {ext} files.]"
    except Exception:
        extracted_content = f"[Could not extract text from {file.filename}]"

    # Parse tags
    tag_list: List[str] = []
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    doc = ProcessDocument(
        title=title,
        department=department,
        category=category,
        content=extracted_content or f"Uploaded file: {file.filename}",
        tags=tag_list,
        file_url=file_url,
        version=1,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _format_doc(doc)


def _format_doc(doc: ProcessDocument) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "department": doc.department,
        "category": doc.category,
        "content": doc.content,
        "tags": doc.tags or [],
        "file_url": doc.file_url,
        "version": doc.version,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }
