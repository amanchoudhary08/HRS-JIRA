from __future__ import annotations

import base64
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings


def _jira_headers() -> Dict[str, str]:
    """
    Jira Data Center: Basic auth with username:password.
    Falls back to Bearer PAT if JIRA_TOKEN is set and password is empty.
    """
    if settings.JIRA_TOKEN and not settings.ATLASSIAN_PASSWORD:
        # Personal Access Token (Data Center 8.14+)
        return {
            "Authorization": f"Bearer {settings.JIRA_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    # Basic auth with username:password (works on all Data Center versions)
    creds = base64.b64encode(
        f"{settings.ATLASSIAN_USER}:{settings.ATLASSIAN_PASSWORD}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _confluence_headers() -> Dict[str, str]:
    """
    Confluence Data Center with OAuth/SSO: requires a Personal Access Token (PAT).
    Generate one at: https://confluence.hrs.io/plugins/personalaccesstokens/usertokens.action
    Set CONFLUENCE_TOKEN=<your PAT> in .env
    """
    if not settings.CONFLUENCE_TOKEN:
        raise ValueError(
            "Confluence requires a Personal Access Token (PAT). "
            "Generate one at: https://confluence.hrs.io/plugins/personalaccesstokens/usertokens.action "
            "then set CONFLUENCE_TOKEN=<token> in backend/.env"
        )
    return {
        "Authorization": f"Bearer {settings.CONFLUENCE_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


# ---------------------------------------------------------------------------
# Jira (Data Center REST API v2/v3 — same endpoints, /rest/api/2 is safest)
# ---------------------------------------------------------------------------

_JIRA_API = lambda: f"{settings.JIRA_URL}/rest/api/2"


async def jira_get_my_issues(project_key: Optional[str] = None, max_results: int = 20) -> List[Dict[str, Any]]:
    jql = f"project = {project_key}" if project_key else "assignee = currentUser() ORDER BY updated DESC"
    params = {"jql": jql, "maxResults": max_results, "fields": "summary,status,priority,assignee,description,updated"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(f"{_JIRA_API()}/search", headers=_jira_headers(), params=params)
        r.raise_for_status()
        issues = r.json().get("issues", [])
    return [
        {
            "key": i["key"],
            "summary": i["fields"]["summary"],
            "status": i["fields"]["status"]["name"],
            "priority": (i["fields"].get("priority") or {}).get("name", "None"),
            "assignee": (i["fields"].get("assignee") or {}).get("displayName", "Unassigned"),
            "url": f"{settings.JIRA_URL}/browse/{i['key']}",
        }
        for i in issues
    ]


async def jira_get_issue(issue_key: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_JIRA_API()}/issue/{issue_key}",
            headers=_jira_headers(),
            params={"fields": "summary,status,priority,assignee,description,comment,subtasks"},
        )
        r.raise_for_status()
        data = r.json()
    fields = data["fields"]
    comments = [
        {"author": c["author"]["displayName"], "body": c["body"], "created": c["created"]}
        for c in (fields.get("comment", {}).get("comments") or [])[-5:]
    ]
    return {
        "key": data["key"],
        "summary": fields["summary"],
        "status": fields["status"]["name"],
        "priority": (fields.get("priority") or {}).get("name", "None"),
        "assignee": (fields.get("assignee") or {}).get("displayName", "Unassigned"),
        "description": fields.get("description") or "",
        "comments": comments,
        "url": f"{settings.JIRA_URL}/browse/{data['key']}",
    }


async def jira_search_issues(jql: str, max_results: int = 20) -> List[Dict[str, Any]]:
    params = {"jql": jql, "maxResults": max_results, "fields": "summary,status,priority,assignee,updated"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(f"{_JIRA_API()}/search", headers=_jira_headers(), params=params)
        r.raise_for_status()
        issues = r.json().get("issues", [])
    return [
        {
            "key": i["key"],
            "summary": i["fields"]["summary"],
            "status": i["fields"]["status"]["name"],
            "priority": (i["fields"].get("priority") or {}).get("name", "None"),
            "assignee": (i["fields"].get("assignee") or {}).get("displayName", "Unassigned"),
            "url": f"{settings.JIRA_URL}/browse/{i['key']}",
        }
        for i in issues
    ]


async def jira_create_issue(
    project_key: str,
    summary: str,
    description: str,
    issue_type: str = "Task",
    priority: str = "Medium",
) -> Dict[str, Any]:
    # Jira Data Center uses plain text for description (not ADF)
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "description": description,
            "issuetype": {"name": issue_type},
            "priority": {"name": priority},
        }
    }
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.post(f"{_JIRA_API()}/issue", headers=_jira_headers(), json=payload)
        r.raise_for_status()
        data = r.json()
    return {"key": data["key"], "url": f"{settings.JIRA_URL}/browse/{data['key']}", "id": data["id"]}


async def jira_update_issue(
    issue_key: str,
    summary: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[str] = None,
) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    if summary:
        fields["summary"] = summary
    if description:
        fields["description"] = description
    if priority:
        fields["priority"] = {"name": priority}
    if not fields:
        return {"issue_key": issue_key, "status": "no_changes"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.put(
            f"{_JIRA_API()}/issue/{issue_key}",
            headers=_jira_headers(),
            json={"fields": fields},
        )
        r.raise_for_status()
    return {"issue_key": issue_key, "status": "updated", "url": f"{settings.JIRA_URL}/browse/{issue_key}"}


async def jira_add_comment(issue_key: str, comment: str) -> Dict[str, Any]:
    payload = {"body": comment}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.post(
            f"{_JIRA_API()}/issue/{issue_key}/comment",
            headers=_jira_headers(),
            json=payload,
        )
        r.raise_for_status()
    return {"issue_key": issue_key, "status": "comment_added"}


async def jira_transition_issue(issue_key: str, status_name: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_JIRA_API()}/issue/{issue_key}/transitions",
            headers=_jira_headers(),
        )
        r.raise_for_status()
        transitions = r.json().get("transitions", [])
        match = next((t for t in transitions if status_name.lower() in t["name"].lower()), None)
        if not match:
            available = [t["name"] for t in transitions]
            return {"error": f"Status '{status_name}' not found. Available: {available}"}
        await client.post(
            f"{_JIRA_API()}/issue/{issue_key}/transitions",
            headers=_jira_headers(),
            json={"transition": {"id": match["id"]}},
        )
    return {"issue_key": issue_key, "new_status": match["name"]}


async def jira_list_projects() -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(f"{_JIRA_API()}/project", headers=_jira_headers())
        r.raise_for_status()
        projects = r.json()
    return [{"key": p["key"], "name": p["name"], "id": p["id"]} for p in projects]


# ---------------------------------------------------------------------------
# Confluence (Data Center REST API)
# ---------------------------------------------------------------------------

_CONF_API = lambda: f"{settings.CONFLUENCE_URL}/rest/api"


async def confluence_search_pages(query: str, space_key: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    cql = f'text ~ "{query}" AND type = page'
    if space_key:
        cql += f' AND space.key = "{space_key}"'
    params = {"cql": cql, "limit": limit, "expand": "space,version"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_CONF_API()}/content/search",
            headers=_confluence_headers(),
            params=params,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "space": p.get("space", {}).get("name", ""),
            "url": f"{settings.CONFLUENCE_URL}{p['_links'].get('webui', '')}",
            "version": p.get("version", {}).get("number", 1),
        }
        for p in results
    ]


async def confluence_get_page(page_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_CONF_API()}/content/{page_id}",
            headers=_confluence_headers(),
            params={"expand": "body.storage,space,version,ancestors"},
        )
        r.raise_for_status()
        data = r.json()
    return {
        "id": data["id"],
        "title": data["title"],
        "space": data.get("space", {}).get("name", ""),
        "body": data["body"]["storage"]["value"],
        "version": data["version"]["number"],
        "url": f"{settings.CONFLUENCE_URL}{data['_links'].get('webui', '')}",
    }


async def confluence_get_page_by_title(space_key: str, title: str) -> Optional[Dict[str, Any]]:
    params = {"spaceKey": space_key, "title": title, "expand": "body.storage,version"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_CONF_API()}/content",
            headers=_confluence_headers(),
            params=params,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
    if not results:
        return None
    p = results[0]
    return {
        "id": p["id"],
        "title": p["title"],
        "body": p["body"]["storage"]["value"],
        "version": p["version"]["number"],
        "url": f"{settings.CONFLUENCE_URL}{p['_links'].get('webui', '')}",
    }


async def confluence_create_page(
    space_key: str,
    title: str,
    body_html: str,
    parent_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "page",
        "title": title,
        "space": {"key": space_key},
        "body": {"storage": {"value": body_html, "representation": "storage"}},
    }
    if parent_id:
        payload["ancestors"] = [{"id": parent_id}]
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.post(
            f"{_CONF_API()}/content",
            headers=_confluence_headers(),
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    return {
        "id": data["id"],
        "title": data["title"],
        "url": f"{settings.CONFLUENCE_URL}{data['_links'].get('webui', '')}",
    }


async def confluence_update_page(
    page_id: str,
    title: str,
    body_html: str,
    current_version: int,
) -> Dict[str, Any]:
    payload = {
        "type": "page",
        "title": title,
        "version": {"number": current_version + 1},
        "body": {"storage": {"value": body_html, "representation": "storage"}},
    }
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.put(
            f"{_CONF_API()}/content/{page_id}",
            headers=_confluence_headers(),
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    return {
        "id": data["id"],
        "title": data["title"],
        "version": data["version"]["number"],
        "url": f"{settings.CONFLUENCE_URL}{data['_links'].get('webui', '')}",
    }


async def confluence_list_spaces() -> List[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(
            f"{_CONF_API()}/space",
            headers=_confluence_headers(),
            params={"limit": 50, "type": "global"},
        )
        r.raise_for_status()
        results = r.json().get("results", [])
    return [{"key": s["key"], "name": s["name"]} for s in results]
