from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.middleware.auth import get_current_user
from app.services import jira_confluence_service as jc

router = APIRouter()


# ---------------------------------------------------------------------------
# Jira endpoints
# ---------------------------------------------------------------------------

@router.get("/jira/projects")
async def list_jira_projects(_: Any = Depends(get_current_user)):
    try:
        return await jc.jira_list_projects()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/jira/issues")
async def search_jira_issues(
    jql: str = Query(...),
    max_results: int = Query(20),
    _: Any = Depends(get_current_user),
):
    try:
        return await jc.jira_search_issues(jql, max_results)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/jira/issues/{issue_key}")
async def get_jira_issue(issue_key: str, _: Any = Depends(get_current_user)):
    try:
        return await jc.jira_get_issue(issue_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class CreateIssueRequest(BaseModel):
    project_key: str
    summary: str
    description: str
    issue_type: str = "Task"
    priority: str = "Medium"


@router.post("/jira/issues")
async def create_jira_issue(body: CreateIssueRequest, _: Any = Depends(get_current_user)):
    try:
        return await jc.jira_create_issue(
            body.project_key, body.summary, body.description, body.issue_type, body.priority
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class AddCommentRequest(BaseModel):
    comment: str


@router.post("/jira/issues/{issue_key}/comment")
async def add_jira_comment(issue_key: str, body: AddCommentRequest, _: Any = Depends(get_current_user)):
    try:
        return await jc.jira_add_comment(issue_key, body.comment)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class TransitionRequest(BaseModel):
    status_name: str


@router.post("/jira/issues/{issue_key}/transition")
async def transition_jira_issue(issue_key: str, body: TransitionRequest, _: Any = Depends(get_current_user)):
    try:
        return await jc.jira_transition_issue(issue_key, body.status_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Confluence endpoints
# ---------------------------------------------------------------------------

@router.get("/confluence/spaces")
async def list_confluence_spaces(_: Any = Depends(get_current_user)):
    try:
        return await jc.confluence_list_spaces()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/confluence/search")
async def search_confluence(
    query: str = Query(...),
    space_key: Optional[str] = Query(None),
    limit: int = Query(10),
    _: Any = Depends(get_current_user),
):
    try:
        return await jc.confluence_search_pages(query, space_key, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/confluence/pages/{page_id}")
async def get_confluence_page(page_id: str, _: Any = Depends(get_current_user)):
    try:
        return await jc.confluence_get_page(page_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class CreatePageRequest(BaseModel):
    space_key: str
    title: str
    body_html: str
    parent_id: Optional[str] = None


@router.post("/confluence/pages")
async def create_confluence_page(body: CreatePageRequest, _: Any = Depends(get_current_user)):
    try:
        return await jc.confluence_create_page(body.space_key, body.title, body.body_html, body.parent_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class UpdatePageRequest(BaseModel):
    title: str
    body_html: str
    current_version: int


@router.put("/confluence/pages/{page_id}")
async def update_confluence_page(page_id: str, body: UpdatePageRequest, _: Any = Depends(get_current_user)):
    try:
        return await jc.confluence_update_page(page_id, body.title, body.body_html, body.current_version)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
