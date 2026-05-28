from __future__ import annotations

import asyncio
import json
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.db import (
    Agent,
    CollaborationMessage,
    CollaborationMessageRole,
    CollaborationSession,
    CollaborationSessionStatus,
    Persona,
)
from app.services.ai_service import AGENT_TOOLS, dispatch_tool, get_bedrock_client
from app.config import settings

# ---------------------------------------------------------------------------
# Non-blocking Bedrock streaming helper
# ---------------------------------------------------------------------------

async def _run_bedrock_stream(invoke_fn) -> AsyncGenerator[str, None]:
    """Run a boto3 invoke_model_with_response_stream call in a thread pool
    and yield text chunks back to the caller via an asyncio Queue.
    This keeps the event loop free so SSE events flush in real time."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=512)

    def _worker():
        try:
            resp = invoke_fn()
            body = resp.get("body")
            if body:
                for ev in body:
                    raw = ev.get("chunk")
                    if raw:
                        data = json.loads(raw["bytes"].decode())
                        if data.get("type") == "content_block_delta":
                            text = data.get("delta", {}).get("text", "")
                            if text:
                                loop.call_soon_threadsafe(queue.put_nowait, text)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, f"\n[stream error: {exc}]")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

    fut = loop.run_in_executor(None, _worker)
    try:
        while True:
            text = await queue.get()
            if text is None:
                break
            yield text
    finally:
        await fut


# In-memory cancellation flags: session_id → True means stop requested
_cancel_flags: set[int] = set()


def request_cancel(session_id: int) -> None:
    _cancel_flags.add(session_id)


def _is_cancelled(session_id: int) -> bool:
    return session_id in _cancel_flags


def _clear_cancel(session_id: int) -> None:
    _cancel_flags.discard(session_id)


# ---------------------------------------------------------------------------
# Load ALL agents from DB and build a catalog for the orchestrator
# ---------------------------------------------------------------------------

async def _load_agent_catalog(db: AsyncSession) -> tuple[Dict[int, Dict], str]:
    result = await db.execute(
        select(Agent).options(
            selectinload(Agent.persona).selectinload(Persona.skill_file),
            selectinload(Agent.persona).selectinload(Persona.department),
        )
    )
    agents = result.scalars().all()

    catalog: Dict[int, Dict] = {}
    lines: List[str] = []

    for a in agents:
        p = a.persona
        if not p:
            continue
        dept = p.department.name if p.department else "Unknown"
        responsibilities = (p.responsibilities or [])[:4]
        processes = (p.processes or [])[:2]
        skill_excerpt = ""
        if p.skill_file and p.skill_file.content:
            skill_excerpt = p.skill_file.content[:400]

        catalog[a.id] = {
            "agent_id": a.id,
            "agent_name": a.name,
            "persona_name": p.name,
            "persona_slug": p.slug or "",
            "department": dept,
            "responsibilities": responsibilities,
            "processes": processes,
            "skill_excerpt": skill_excerpt,
        }

        resp_str = "; ".join(responsibilities)
        lines.append(
            f'  - agent_id={a.id} | "{p.name}" | dept={dept}\n'
            f'    responsibilities: {resp_str}'
        )

    catalog_str = "\n".join(lines)
    return catalog, catalog_str


# ---------------------------------------------------------------------------
# Orchestrator: selects agents, order, tasks
# ---------------------------------------------------------------------------

async def _stream_orchestrator_plan(
    problem_statement: str,
    catalog_str: str,
) -> AsyncGenerator[dict, None]:
    yield {"type": "orchestrator_start"}

    system_prompt = (
        "You are an expert engineering orchestrator at a travel-tech company (HRS). "
        "Given a problem statement and a catalog of available AI agents, you must:\n"
        "1. Analyse the problem and understand what expertise is needed.\n"
        "2. Select EXACTLY 3 to 5 agents — never more than 5, never fewer than 3.\n"
        "3. Order them logically (e.g. strategy → design → engineering → QA → ops).\n"
        "4. Assign each agent a specific, concrete task that builds on the previous agent's output.\n\n"
        "IMPORTANT: Pick agents that genuinely match the problem domain. "
        "For a data problem, include Data Engineer/BI Analyst. "
        "For HR tooling, include HR agents. "
        "For infra work, include DevOps/Infrastructure. "
        "Do NOT always pick the same set — choose based on what the problem actually needs. "
        "HARD LIMIT: the JSON array must contain no more than 5 items.\n\n"
        "Be concise. Write ONE sentence of rationale then immediately output the JSON block fenced with ```json "
        "containing an array:\n"
        '[{"agent_id": <int>, "persona_name": "<str>", "role_label": "<str>", "task": "<str>"}, ...]'
        "\nThe role_label is a short display name like 'PM', 'Data Engineer', 'QA Lead', etc."
    )

    user_message = (
        f"**Problem Statement:** {problem_statement}\n\n"
        f"**Available Agents:**\n{catalog_str}\n\n"
        "Select agents and assign tasks. Output JSON immediately."
    )

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1200,
        "temperature": 0.3,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    })

    accumulated = ""

    def _invoke():
        client = get_bedrock_client()
        return client.invoke_model_with_response_stream(
            modelId=settings.BEDROCK_MODEL_ID, body=body
        )

    try:
        async for text in _run_bedrock_stream(_invoke):
            accumulated += text
            yield {"type": "orchestrator_chunk", "content": text}
    except Exception as exc:
        err_msg = str(exc)
        if "Token has expired" in err_msg or "TokenRetrievalError" in err_msg:
            err_msg = "AWS SSO token has expired. Run: aws sso login --profile Developer-721906891174"
        elif "AccessDeniedException" in err_msg or "UnrecognizedClientException" in err_msg:
            err_msg = f"AWS credentials error: {err_msg}"
        yield {"type": "orchestrator_error", "message": err_msg}
        return

    plan = _extract_agent_plan(accumulated)
    yield {"type": "orchestrator_done", "plan": plan, "full_text": accumulated}


def _extract_agent_plan(text: str) -> List[Dict[str, Any]]:
    match = re.search(r"```json\s*(\[.*?\])\s*```", text, re.DOTALL)
    if match:
        try:
            plan = json.loads(match.group(1))
            valid = []
            for item in plan:
                if isinstance(item, dict) and "agent_id" in item and "task" in item:
                    valid.append({
                        "agent_id": int(item["agent_id"]),
                        "persona_name": item.get("persona_name", f"Agent {item['agent_id']}"),
                        "role_label": item.get("role_label", item.get("persona_name", "Agent")),
                        "task": item["task"],
                    })
            if valid:
                return valid[:5]
        except (json.JSONDecodeError, ValueError, KeyError):
            pass
    return []


# ---------------------------------------------------------------------------
# Per-agent turn
# ---------------------------------------------------------------------------

async def _stream_agent_turn(
    agent_info: Dict[str, Any],
    assigned_task: str,
    prior_context: str,
    problem_statement: str,
    role_label: str = "",
) -> AsyncGenerator[dict, None]:
    agent_id = agent_info["agent_id"]
    agent_name = agent_info["agent_name"]
    persona_name = agent_info["persona_name"]
    department = agent_info.get("department", "")

    yield {
        "type": "agent_start",
        "role_slug": role_label,
        "role_label": role_label,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "persona_name": persona_name,
        "department": department,
        "task": assigned_task,
    }

    skill_prefix = agent_info.get("skill_excerpt", "")[:2000]
    system_prompt = (
        (f"# Your Skill Profile\n{skill_prefix}\n\n" if skill_prefix else "") +
        f"You are the {persona_name} agent from the {department} department at HRS (a travel-tech company). "
        "You are participating in a multi-agent collaboration. "
        "Be specific, actionable, and concise. Format output in clear Markdown."
    )

    prior_snippet = prior_context[-4000:] if len(prior_context) > 4000 else prior_context
    user_message = (
        f"**Problem Statement:** {problem_statement}\n\n"
        f"**Your Task as {persona_name}:** {assigned_task}\n\n"
        + (f"**Context from previous agents:**\n{prior_snippet}\n\n" if prior_snippet else "")
        + "Execute your task now. Use tools if needed. Produce structured Markdown output."
    )

    messages = [{"role": "user", "content": user_message}]
    loop = asyncio.get_running_loop()
    accumulated_output = ""

    # Tool-use rounds use Haiku (faster + cheaper); final stream uses Sonnet
    haiku_model = settings.BEDROCK_MODEL_HAIKU45 or settings.BEDROCK_MODEL_ID

    # Reduced to 5 tool-use rounds (was 10)
    for _round in range(5):
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "temperature": 0.5,
            "system": system_prompt,
            "tools": AGENT_TOOLS,
            "messages": messages,
        })

        def _invoke_sync(b=body):
            client = get_bedrock_client()
            resp = client.invoke_model(modelId=haiku_model, body=b)
            return json.loads(resp["body"].read())

        try:
            result = await loop.run_in_executor(None, _invoke_sync)
        except Exception as exc:
            yield {"type": "agent_chunk", "role_label": role_label, "agent_id": agent_id, "agent_name": agent_name, "content": f"\n[Bedrock error: {exc}]"}
            break

        content_blocks = result.get("content", [])
        tool_uses = [b for b in content_blocks if b.get("type") == "tool_use"]
        text_parts = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
        interim_text = "\n".join(text_parts).strip()

        if tool_uses:
            if interim_text:
                yield {"type": "agent_chunk", "role_label": role_label, "agent_id": agent_id, "agent_name": agent_name, "content": interim_text + "\n"}
                accumulated_output += interim_text + "\n"

            messages.append({"role": "assistant", "content": content_blocks})
            tool_results = []
            for tu in tool_uses:
                yield {
                    "type": "tool_call",
                    "role_label": role_label,
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "tool_name": tu["name"],
                    "tool_input": tu.get("input", {}),
                }
                tool_output = await dispatch_tool(tu["name"], tu.get("input", {}))
                yield {
                    "type": "tool_result",
                    "role_label": role_label,
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "tool_name": tu["name"],
                    "result": tool_output[:800],
                }
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": tool_output,
                })
            messages.append({"role": "user", "content": tool_results})
            continue

        # No tool calls — stream the final output
        if interim_text and len(interim_text) > 100:
            for chunk in _chunk_text(interim_text):
                accumulated_output += chunk
                yield {"type": "agent_chunk", "role_label": role_label, "agent_id": agent_id, "agent_name": agent_name, "content": chunk}
        else:
            safe_blocks = [b for b in content_blocks if b.get("type") == "text"]
            if safe_blocks:
                messages.append({"role": "assistant", "content": safe_blocks})
            messages.append({
                "role": "user",
                "content": "Provide your complete structured output in Markdown now.",
            })
            stream_body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "temperature": 0.5,
                "system": system_prompt,
                "messages": messages,
            })

            def _invoke_stream(b=stream_body):
                client = get_bedrock_client()
                return client.invoke_model_with_response_stream(
                    modelId=settings.BEDROCK_MODEL_ID, body=b
                )

            try:
                async for text_chunk in _run_bedrock_stream(_invoke_stream):
                    accumulated_output += text_chunk
                    yield {
                        "type": "agent_chunk",
                        "role_label": role_label,
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "content": text_chunk,
                    }
            except Exception as exc:
                yield {
                    "type": "agent_chunk",
                    "role_label": role_label,
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "content": f"\n[Streaming error: {exc}]",
                }

        break

    yield {
        "type": "agent_done",
        "role_slug": role_label,
        "role_label": role_label,
        "agent_id": agent_id,
        "output": accumulated_output,
    }


def _chunk_text(text: str, size: int = 64) -> List[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

async def _stream_synthesis(
    problem_statement: str,
    agent_outputs: Dict[str, str],
) -> AsyncGenerator[dict, None]:
    yield {"type": "synthesis_start"}

    context = "\n\n".join(
        f"## {label} OUTPUT\n{output[:2000]}"
        for label, output in agent_outputs.items()
        if output
    )

    system_prompt = (
        "You are a technical lead synthesising a multi-agent POC collaboration at HRS (travel-tech). "
        "Produce a concise POC summary in Markdown covering:\n"
        "1. **Problem & Solution Overview**\n"
        "2. **Architecture Summary**\n"
        "3. **Key Technical Decisions**\n"
        "4. **Implementation Roadmap** (phases with effort estimates)\n"
        "5. **Risks & Mitigations**\n"
        "6. **Definition of Done**\n\n"
        "Be concise and actionable. Target 400-600 words."
    )

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2500,
        "temperature": 0.3,
        "system": system_prompt,
        "messages": [{"role": "user", "content": f"Problem: {problem_statement}\n\n{context}"}],
    })

    accumulated = ""

    def _invoke():
        client = get_bedrock_client()
        return client.invoke_model_with_response_stream(
            modelId=settings.BEDROCK_MODEL_ID, body=body
        )

    try:
        async for text in _run_bedrock_stream(_invoke):
            accumulated += text
            yield {"type": "synthesis_chunk", "content": text}
    except Exception as exc:
        yield {"type": "synthesis_chunk", "content": f"\n[Synthesis error: {exc}]"}

    yield {
        "type": "deliverables",
        "jira_epic": None,
        "confluence_page": None,
        "synthesis_text": accumulated,
    }


# ---------------------------------------------------------------------------
# Top-level session runner
# ---------------------------------------------------------------------------

async def run_collaboration_session(
    session_id: int,
    db: AsyncSession,
    created_by: Optional[int] = None,
) -> AsyncGenerator[dict, None]:

    session = await db.get(CollaborationSession, session_id)
    if not session:
        yield {"type": "error", "message": f"Session {session_id} not found"}
        return

    _clear_cancel(session_id)
    session.status = CollaborationSessionStatus.RUNNING
    if created_by:
        session.created_by = created_by
    await db.commit()

    sequence = 0
    pending_messages: list = []
    agent_outputs: Dict[str, str] = {}

    async def _queue_message(role, content, agent_id=None, agent_name=None,
                             persona_name=None, tool_name=None, tool_input=None, tool_result=None):
        nonlocal sequence
        sequence += 1
        msg = CollaborationMessage(
            session_id=session_id,
            sequence=sequence,
            role=role,
            agent_id=agent_id,
            agent_name=agent_name,
            persona_name=persona_name,
            content=content or "",
            tool_name=tool_name,
            tool_input=tool_input,
            tool_result=tool_result,
        )
        db.add(msg)
        pending_messages.append(msg)

    async def _flush():
        if pending_messages:
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise
            pending_messages.clear()

    try:
        # ── Load agent catalog ───────────────────────────────────────────────
        catalog, catalog_str = await _load_agent_catalog(db)
        yield {
            "type": "catalog_loaded",
            "agent_count": len(catalog),
            "agents": [
                {
                    "agent_id": v["agent_id"],
                    "persona_name": v["persona_name"],
                    "department": v["department"],
                }
                for v in catalog.values()
            ],
        }

        # ── Orchestrator ─────────────────────────────────────────────────────
        orchestrator_text = ""
        plan: List[Dict[str, Any]] = []

        async for event in _stream_orchestrator_plan(session.problem_statement, catalog_str):
            if event["type"] == "orchestrator_chunk":
                orchestrator_text += event["content"]
            elif event["type"] == "orchestrator_done":
                plan = event["plan"]
            elif event["type"] == "orchestrator_error":
                yield {"type": "error", "message": event["message"]}
                session.status = CollaborationSessionStatus.FAILED
                await db.commit()
                return
            yield event

        if not plan:
            yield {"type": "error", "message": "Orchestrator produced no agent plan. Try rephrasing the problem."}
            session.status = CollaborationSessionStatus.FAILED
            await db.commit()
            return

        await _queue_message(CollaborationMessageRole.ORCHESTRATOR, orchestrator_text)
        await _flush()
        session.orchestrator_plan = plan
        await db.commit()

        # ── Agent turns — ALL run in parallel ────────────────────────────────
        valid_plan = [
            (item, catalog[item["agent_id"]])
            for item in plan
            if catalog.get(item["agent_id"])
        ]

        # Emit skip for any agent not in catalog
        for item in plan:
            if not catalog.get(item["agent_id"]):
                yield {"type": "agent_skip", "agent_id": item["agent_id"], "reason": "Not found in catalog"}

        if valid_plan:
            _SENTINEL = object()
            event_queue: asyncio.Queue = asyncio.Queue()

            async def _run_one(plan_item: dict, agent_info: dict) -> None:
                role_label = plan_item["role_label"]
                agent_text = ""
                try:
                    async for event in _stream_agent_turn(
                        agent_info, plan_item["task"], "",
                        session.problem_statement, role_label=role_label,
                    ):
                        if _is_cancelled(session_id):
                            break
                        etype = event["type"]
                        if etype == "tool_call":
                            await _queue_message(
                                CollaborationMessageRole.TOOL_CALL,
                                f"Called {event['tool_name']}",
                                agent_id=event["agent_id"],
                                agent_name=agent_info["agent_name"],
                                tool_name=event["tool_name"],
                                tool_input=event["tool_input"],
                            )
                        elif etype == "tool_result":
                            await _queue_message(
                                CollaborationMessageRole.TOOL_RESULT,
                                event["result"],
                                agent_id=event["agent_id"],
                                agent_name=agent_info["agent_name"],
                                tool_name=event["tool_name"],
                                tool_result=event["result"],
                            )
                        elif etype == "agent_done":
                            agent_text = event.get("output", "")
                            agent_outputs[role_label] = agent_text
                            await _queue_message(
                                CollaborationMessageRole.AGENT,
                                agent_text,
                                agent_id=event["agent_id"],
                                agent_name=agent_info["agent_name"],
                                persona_name=agent_info["persona_name"],
                            )
                        await event_queue.put(event)
                except Exception as exc:
                    await event_queue.put({
                        "type": "agent_chunk", "role_label": role_label,
                        "agent_id": agent_info["agent_id"], "agent_name": agent_info["agent_name"],
                        "content": f"\n[Agent error: {exc}]",
                    })
                    await event_queue.put({
                        "type": "agent_done", "role_slug": role_label, "role_label": role_label,
                        "agent_id": agent_info["agent_id"], "output": agent_text,
                    })
                    agent_outputs[role_label] = agent_text
                finally:
                    await event_queue.put(_SENTINEL)

            # Launch all agents concurrently
            tasks = [
                asyncio.create_task(_run_one(item, info))
                for item, info in valid_plan
            ]

            # Drain event queue until all agents finish
            remaining = len(tasks)
            while remaining > 0:
                if _is_cancelled(session_id):
                    for t in tasks:
                        t.cancel()
                    yield {"type": "cancelled", "message": "Run stopped by user"}
                    raise asyncio.CancelledError("Stopped by user")
                event = await event_queue.get()
                if event is _SENTINEL:
                    remaining -= 1
                else:
                    yield event

            # Ensure all tasks are fully done
            await asyncio.gather(*tasks, return_exceptions=True)
            await _flush()

        # ── Synthesis ─────────────────────────────────────────────────────────
        synthesis_text = ""

        async for event in _stream_synthesis(session.problem_statement, agent_outputs):
            if event["type"] == "synthesis_chunk":
                synthesis_text += event["content"]
            elif event["type"] == "deliverables":
                session.synthesis_output = synthesis_text
                session.agent_outputs = agent_outputs
                session.jira_epic = event.get("jira_epic")
                session.confluence_page = event.get("confluence_page")
                session.status = CollaborationSessionStatus.COMPLETED
                await _queue_message(CollaborationMessageRole.SYNTHESIS, synthesis_text)
                await _flush()
            yield event

        yield {"type": "session_done", "session_id": session_id}

    except asyncio.CancelledError:
        await db.rollback()
        session = await db.get(CollaborationSession, session_id)
        if session:
            session.status = CollaborationSessionStatus.FAILED
            session.agent_outputs = agent_outputs if agent_outputs else None
            await db.commit()
        _clear_cancel(session_id)
    except Exception as exc:
        await db.rollback()
        session = await db.get(CollaborationSession, session_id)
        if session:
            session.status = CollaborationSessionStatus.FAILED
            await db.commit()
        yield {"type": "error", "message": str(exc)}
    finally:
        _clear_cancel(session_id)
