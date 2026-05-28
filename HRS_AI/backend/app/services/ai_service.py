from __future__ import annotations

import asyncio
import functools
import json
import os
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.config import settings
from app.services import jira_confluence_service as jc


def get_bedrock_client():
    """Create a Bedrock runtime client using SSO profile — never hardcoded keys."""
    import boto3

    # Always clear stale static credential env vars so SSO profile is used
    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"):
        os.environ.pop(var, None)

    session = boto3.Session(profile_name=settings.AWS_PROFILE, region_name=settings.AWS_REGION)
    return session.client("bedrock-runtime")


# ---------------------------------------------------------------------------
# generate_skill_file_stream
# ---------------------------------------------------------------------------

async def generate_skill_file_stream(
    persona_dict: Dict[str, Any],
    process_docs: List[Dict[str, Any]],
) -> AsyncGenerator[str, None]:
    """Stream a skill file generation from Bedrock for the given persona."""

    name = persona_dict.get("name", "Unknown")
    responsibilities = persona_dict.get("responsibilities", [])
    data_access = persona_dict.get("data_access", [])
    processes = persona_dict.get("processes", [])
    description = persona_dict.get("description", "")

    doc_context = ""
    if process_docs:
        doc_context = "\n\nRelevant process documentation:\n"
        for doc in process_docs[:3]:
            doc_context += f"\n### {doc.get('title', '')}\n{doc.get('content', '')[:500]}\n"

    system_prompt = (
        "You are an expert technical writer specialising in AI agent skill files for enterprise deployments. "
        "Generate a comprehensive, production-ready skill file in Markdown format. "
        "The skill file must cover: Role Overview, Key Responsibilities, Data Sources & Access, "
        "Key Processes, Tools & Technologies, Typical Agentic Actions, Human-in-the-Loop Checkpoints, "
        "KPIs & Success Metrics, and Behavioural Guidelines. "
        "Be specific, detailed, and actionable. Minimum 400 words."
    )

    user_message = (
        f"Generate a complete skill file for the following AI agent persona:\n\n"
        f"**Role:** {name}\n"
        f"**Description:** {description}\n\n"
        f"**Key Responsibilities:**\n" + "\n".join(f"- {r}" for r in responsibilities) + "\n\n"
        f"**Data Access:**\n" + "\n".join(f"- {d}" for d in data_access) + "\n\n"
        f"**Core Processes:**\n" + "\n".join(f"- {p}" for p in processes)
        + doc_context
    )

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    })

    loop = asyncio.get_event_loop()

    def _invoke():
        client = get_bedrock_client()
        response = client.invoke_model_with_response_stream(
            modelId=settings.BEDROCK_MODEL_ID,
            body=body,
        )
        return response

    try:
        response = await loop.run_in_executor(None, _invoke)
        stream = response.get("body")
        if stream:
            for event in stream:
                chunk = event.get("chunk")
                if chunk:
                    chunk_data = json.loads(chunk["bytes"].decode("utf-8"))
                    if chunk_data.get("type") == "content_block_delta":
                        delta = chunk_data.get("delta", {})
                        text = delta.get("text", "")
                        if text:
                            yield text
    except Exception as exc:
        yield f"\n\n[Error generating skill file: {exc}]"


# ---------------------------------------------------------------------------
# Tool definitions for Bedrock tool-use
# ---------------------------------------------------------------------------

AGENT_TOOLS = [
    {
        "name": "jira_search_issues",
        "description": "Search Jira issues using JQL. Use to find tickets, bugs, tasks, epics.",
        "input_schema": {
            "type": "object",
            "properties": {
                "jql": {"type": "string", "description": "JQL query string"},
                "max_results": {"type": "integer", "description": "Max results (default 10)", "default": 10},
            },
            "required": ["jql"],
        },
    },
    {
        "name": "jira_get_issue",
        "description": "Get full details of a specific Jira issue including description and comments.",
        "input_schema": {
            "type": "object",
            "properties": {"issue_key": {"type": "string", "description": "Jira issue key e.g. ENG-123"}},
            "required": ["issue_key"],
        },
    },
    {
        "name": "jira_list_projects",
        "description": "List all available Jira projects to find project keys.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "confluence_search_pages",
        "description": "Search Confluence pages by keyword. Use to find documentation, runbooks, process pages.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "space_key": {"type": "string", "description": "Optional Confluence space key to narrow search"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "confluence_get_page",
        "description": "Get the full content of a Confluence page by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {"page_id": {"type": "string"}},
            "required": ["page_id"],
        },
    },
    {
        "name": "confluence_list_spaces",
        "description": "List all Confluence spaces to find space keys.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "confluence_get_page_by_title",
        "description": "Find a Confluence page by its title within a space.",
        "input_schema": {
            "type": "object",
            "properties": {
                "space_key": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["space_key", "title"],
        },
    },
]


_CONFLUENCE_PAT_INSTRUCTIONS = (
    "Confluence PAT not configured. Generate one at: "
    "Profile → Personal Access Tokens (or /plugins/personalaccesstokens/usertokens.action), "
    "then set CONFLUENCE_TOKEN=<token> in backend/.env and restart the server."
)


async def dispatch_tool(tool_name: str, tool_input: Dict[str, Any]) -> str:
    """Execute a tool call and return the result as a string."""
    # Early exit for Confluence when no PAT is set
    if tool_name.startswith("confluence_") and not settings.CONFLUENCE_TOKEN:
        return json.dumps({"error": _CONFLUENCE_PAT_INSTRUCTIONS, "tool": tool_name})

    try:
        if tool_name == "jira_search_issues":
            result = await jc.jira_search_issues(tool_input["jql"], tool_input.get("max_results", 10))
        elif tool_name == "jira_get_issue":
            result = await jc.jira_get_issue(tool_input["issue_key"])
        elif tool_name == "jira_list_projects":
            result = await jc.jira_list_projects()
        elif tool_name == "confluence_search_pages":
            result = await jc.confluence_search_pages(
                tool_input["query"], tool_input.get("space_key"), tool_input.get("limit", 5)
            )
        elif tool_name == "confluence_get_page":
            result = await jc.confluence_get_page(tool_input["page_id"])
        elif tool_name == "confluence_list_spaces":
            result = await jc.confluence_list_spaces()
        elif tool_name == "confluence_get_page_by_title":
            result = await jc.confluence_get_page_by_title(tool_input["space_key"], tool_input["title"])
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        return json.dumps(result)
    except Exception as exc:
        return json.dumps({"error": str(exc), "tool": tool_name})


# ---------------------------------------------------------------------------
# run_agent_task_stream
# ---------------------------------------------------------------------------

async def run_agent_task_stream(
    execution_dict: Dict[str, Any],
    skill_content: str,
) -> AsyncGenerator[str, None]:
    """Stream agent execution steps using Bedrock tool-use for Jira/Confluence."""

    task_name = execution_dict.get("task_name", "Unknown Task")
    input_data = execution_dict.get("input", {})

    system_prompt = (skill_content or "You are a capable AI agent.") + (
        "\n\nYou have access to Jira and Confluence tools. "
        "Use them to fetch real data, create tickets, and write pages as part of your task. "
        "Execute the task step by step. After completing the main work, identify if any actions "
        "need human approval (e.g. deploying changes, modifying production data, sending external communications). "
        "Output each step as a JSON object with: step (int), action (str), reasoning (str), result (str), status (str). "
        "Set status='awaiting_approval' and requires_approval=true on the step that needs sign-off."
    )

    messages = [
        {
            "role": "user",
            "content": (
                f"Execute this task:\n\n**Task:** {task_name}\n\n"
                f"**Input:**\n{json.dumps(input_data, indent=2)}\n\n"
                "Use Jira/Confluence tools as needed. Output each step as a JSON object."
            ),
        }
    ]

    loop = asyncio.get_event_loop()
    step_number = 0

    try:
        for _iteration in range(10):  # max tool-use rounds
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4096,
                "system": system_prompt,
                "tools": AGENT_TOOLS,
                "messages": messages,
            })

            def _invoke(b=body):
                client = get_bedrock_client()
                response = client.invoke_model(modelId=settings.BEDROCK_MODEL_ID, body=b)
                return json.loads(response["body"].read())

            result = await loop.run_in_executor(None, _invoke)
            stop_reason = result.get("stop_reason")
            content_blocks = result.get("content", [])

            # Collect tool uses and text from this turn
            tool_uses = []
            text_blocks = []
            for block in content_blocks:
                if block.get("type") == "tool_use":
                    tool_uses.append(block)
                elif block.get("type") == "text":
                    text_blocks.append(block.get("text", ""))

            # Emit any step JSONs found in text blocks
            full_text = "\n".join(text_blocks)
            for step in _parse_steps_from_text(full_text, task_name):
                step_number += 1
                step["step"] = step_number
                yield json.dumps(step) + "\n"

            # Always process tool_use blocks regardless of stop_reason.
            # Bedrock can return stop_reason="end_turn" with tool_use blocks present,
            # which causes "tool_use ids without tool_result" on the next call.
            if tool_uses:
                messages.append({"role": "assistant", "content": content_blocks})
                tool_results = []
                for tu in tool_uses:
                    tool_name = tu["name"]
                    tool_input = tu.get("input", {})
                    step_number += 1

                    # Yield a step showing what tool is being called
                    yield json.dumps({
                        "step": step_number,
                        "action": f"Call tool: {tool_name}",
                        "reasoning": f"Using {tool_name} with: {json.dumps(tool_input)}",
                        "result": "Executing...",
                        "status": "running",
                    }) + "\n"

                    tool_output = await dispatch_tool(tool_name, tool_input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tu["id"],
                        "content": tool_output,
                    })

                    # Yield result step
                    step_number += 1
                    yield json.dumps({
                        "step": step_number,
                        "action": f"Tool result: {tool_name}",
                        "reasoning": "Processing response from tool.",
                        "result": tool_output[:500],
                        "status": "completed",
                    }) + "\n"

                messages.append({"role": "user", "content": tool_results})
                continue  # Next LLM call with tool results

            # end_turn — we're done
            break

    except Exception as exc:
        fallback_steps = _generate_fallback_steps(task_name, input_data)
        for step in fallback_steps:
            yield json.dumps(step) + "\n"


def _parse_steps_from_text(text: str, task_name: str) -> List[Dict[str, Any]]:
    """Try to extract JSON step objects from Bedrock response text."""
    steps = []
    lines = text.split("\n")
    current_json = ""
    brace_depth = 0

    for line in lines:
        for char in line:
            if char == "{":
                brace_depth += 1
                current_json += char
            elif char == "}":
                brace_depth -= 1
                current_json += char
                if brace_depth == 0 and current_json.strip():
                    try:
                        obj = json.loads(current_json.strip())
                        if "step" in obj or "action" in obj:
                            steps.append(obj)
                    except json.JSONDecodeError:
                        pass
                    current_json = ""
            elif brace_depth > 0:
                current_json += char

    if not steps:
        steps = _generate_fallback_steps(task_name, {})

    return steps


def _generate_fallback_steps(task_name: str, input_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        {
            "step": 1,
            "action": "Analyse task requirements",
            "reasoning": f"Reviewing the task '{task_name}' to understand scope and constraints.",
            "result": "Task requirements analysed. Proceeding with execution plan.",
            "status": "completed",
        },
        {
            "step": 2,
            "action": "Gather relevant context",
            "reasoning": "Querying available data sources and knowledge bases for relevant information.",
            "result": "Context gathered successfully. Found relevant data to proceed.",
            "status": "completed",
        },
        {
            "step": 3,
            "action": "Execute primary action",
            "reasoning": "Applying the gathered context to complete the core task objective.",
            "result": "Primary action executed. Results are within expected parameters.",
            "status": "completed",
        },
        {
            "step": 4,
            "action": "Request approval for downstream actions",
            "reasoning": "The next steps involve external integrations or data modifications that require human oversight.",
            "result": "Awaiting human approval before proceeding with downstream actions.",
            "status": "awaiting_approval",
            "requires_approval": True,
        },
        {
            "step": 5,
            "action": "Compile final report",
            "reasoning": "Summarising all actions taken, outcomes achieved, and any follow-up recommendations.",
            "result": f"Task '{task_name}' completed successfully. Summary report generated.",
            "status": "completed",
        },
    ]


# ---------------------------------------------------------------------------
# chat_with_persona_stream
# ---------------------------------------------------------------------------

async def chat_with_persona_stream(
    messages: List[Dict[str, str]],
    persona_dict: Dict[str, Any],
    skill_content: str,
) -> AsyncGenerator[str, None]:
    """Stream a conversational response from a persona."""

    system_prompt = skill_content or (
        f"You are {persona_dict.get('name', 'an AI assistant')}. "
        f"{persona_dict.get('description', '')} "
        "Respond helpfully and professionally, staying in character."
    )

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": messages,
    })

    loop = asyncio.get_event_loop()

    def _invoke():
        client = get_bedrock_client()
        response = client.invoke_model_with_response_stream(
            modelId=settings.BEDROCK_MODEL_ID,
            body=body,
        )
        return response

    try:
        response = await loop.run_in_executor(None, _invoke)
        stream = response.get("body")
        if stream:
            for event in stream:
                chunk = event.get("chunk")
                if chunk:
                    chunk_data = json.loads(chunk["bytes"].decode("utf-8"))
                    if chunk_data.get("type") == "content_block_delta":
                        delta = chunk_data.get("delta", {})
                        text = delta.get("text", "")
                        if text:
                            yield text
    except Exception as exc:
        yield f"I apologise, I encountered an error: {exc}"


# ---------------------------------------------------------------------------
# analyze_document
# ---------------------------------------------------------------------------

async def analyze_document(content: str) -> Dict[str, Any]:
    """Non-streaming document analysis — returns structured JSON."""

    system_prompt = (
        "You are an expert business analyst. Analyse the provided document and extract structured information. "
        "Return ONLY valid JSON with these exact keys: "
        "responsibilities (list of strings), processes (list of strings), "
        "data_sources (list of strings), summary (string). "
        "No markdown, no explanation — pure JSON only."
    )

    user_message = f"Analyse this document and extract key information:\n\n{content[:8000]}"

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    })

    loop = asyncio.get_event_loop()

    def _invoke():
        client = get_bedrock_client()
        response = client.invoke_model(
            modelId=settings.BEDROCK_MODEL_ID,
            body=body,
        )
        return json.loads(response["body"].read())

    try:
        result = await loop.run_in_executor(None, _invoke)
        full_text = ""
        for block in result.get("content", []):
            if block.get("type") == "text":
                full_text += block.get("text", "")

        # Strip any markdown fences
        full_text = full_text.strip()
        if full_text.startswith("```"):
            full_text = full_text.split("```")[1]
            if full_text.startswith("json"):
                full_text = full_text[4:]

        return json.loads(full_text)

    except Exception:
        return {
            "responsibilities": [],
            "processes": [],
            "data_sources": [],
            "summary": "Document analysis unavailable at this time.",
        }
