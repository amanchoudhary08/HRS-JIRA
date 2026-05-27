import React, { useState, useRef, useEffect } from "react";
import { X, Sparkles, Send, Loader2, RotateCcw, Zap } from "lucide-react";
import { AI_URL } from "../api/aiClient";
import aiApi from "../api/aiApi";
import type { Task, Comment } from "../types";

interface AIPanelProps {
  task: Task;
  projectId: string;
  comments: Comment[];
  onClose: () => void;
}

interface ActionTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
}

const QUICK_ACTION_LABELS: Record<string, string> = {
  summarize: "Summarise task",
  summary: "Summarise task",
  subtask: "Generate subtasks",
  subtasks: "Generate subtasks",
  related: "Find related tasks",
  acceptance: "Write acceptance criteria",
  criteria: "Write acceptance criteria",
  triage: "Triage task",
  analyze: "Analyse task",
};

function normaliseLabel(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, label] of Object.entries(QUICK_ACTION_LABELS)) {
    if (lower.includes(key)) return label;
  }
  return name;
}

export function AIPanel({ task, projectId, comments, onClose }: AIPanelProps) {
  const [templates, setTemplates] = useState<ActionTemplate[]>([]);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aiApi
      .get("/actions/templates")
      .then((r) => setTemplates(r.data.slice(0, 5)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  function buildContext() {
    return {
      project_id: projectId,
      task_id: task.id,
      task_title: task.title,
      task_description: task.description ?? "",
      task_status: task.status,
      task_priority: task.priority,
      task_type: task.type,
      comments: comments.map((c) => c.body),
    };
  }

  async function runTemplate(template: ActionTemplate) {
    if (streaming) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setActiveTemplateId(template.id);
    setOutput("");
    setStreaming(true);

    try {
      const token = localStorage.getItem("taskflow_token");
      const res = await fetch(`${AI_URL}/api/actions/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          template_id: template.id,
          input: buildContext(),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "chunk" && evt.content) {
              setOutput((p) => p + evt.content);
            } else if (evt.type === "step" && evt.step?.output) {
              setOutput((p) => p + evt.step.output);
            } else if (evt.type === "done") {
              break;
            } else if (evt.type === "error") {
              setOutput((p) => p + "\n\n⚠️ " + evt.message);
            }
          } catch {
            // non-JSON SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setOutput((p) => p + "\n\n⚠️ Failed to connect to AI service.");
      }
    } finally {
      setStreaming(false);
      setActiveTemplateId(null);
    }
  }

  async function runFreeForm() {
    if (!prompt.trim() || streaming) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setOutput("");
    setStreaming(true);

    const ctx = buildContext();
    const systemCtx = `Task: ${ctx.task_title}\nDescription: ${ctx.task_description}\nStatus: ${ctx.task_status}\nPriority: ${ctx.task_priority}\n`;

    try {
      const token = localStorage.getItem("taskflow_token");
      const res = await fetch(`${AI_URL}/api/actions/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemCtx },
            { role: "user", content: prompt },
          ],
          // persona_id is required by backend — will 404 gracefully if no personas exist
          persona_id: 1,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "chunk" && evt.content) {
              setOutput((p) => p + evt.content);
            } else if (evt.type === "done") {
              break;
            } else if (evt.type === "error") {
              setOutput((p) => p + "\n\n⚠️ " + evt.message);
            }
          } catch {
            // non-JSON SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setOutput((p) => p + "\n\n⚠️ Failed to connect to AI service.");
      }
    } finally {
      setStreaming(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    setActiveTemplateId(null);
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-0, #08050f)",
        color: "#f0f0ff",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "18px 24px",
          borderBottom: "1px solid rgba(34,211,238,0.12)",
          flexShrink: 0,
        }}
      >
        <Sparkles size={15} style={{ color: "#22d3ee" }} />
        <span style={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
          AI Assistant
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "2px 8px",
            borderRadius: 12,
            background: "rgba(34,211,238,0.1)",
            color: "#22d3ee",
            border: "1px solid rgba(34,211,238,0.2)",
            fontWeight: 600,
          }}
        >
          {task.title.length > 28 ? task.title.slice(0, 28) + "…" : task.title}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
            display: "flex",
            padding: 4,
            borderRadius: 6,
          }}
          title="Close AI panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick actions */}
      {templates.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#475569",
              marginBottom: 8,
            }}
          >
            Quick actions
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => runTemplate(t)}
                disabled={streaming}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: `1px solid ${activeTemplateId === t.id ? "rgba(34,211,238,0.4)" : "rgba(34,211,238,0.15)"}`,
                  background:
                    activeTemplateId === t.id
                      ? "rgba(34,211,238,0.12)"
                      : "rgba(34,211,238,0.05)",
                  color: activeTemplateId === t.id ? "#22d3ee" : "#94a3b8",
                  cursor: streaming ? "not-allowed" : "pointer",
                  opacity: streaming && activeTemplateId !== t.id ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
              >
                {activeTemplateId === t.id && streaming ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Zap size={10} />
                )}
                {normaliseLabel(t.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Output area */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          fontSize: "0.83rem",
          lineHeight: 1.65,
          color: "#cbd5e1",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {output ? (
          <>
            {output}
            {streaming && (
              <span style={{ color: "#22d3ee" }} className="animate-pulse">
                █
              </span>
            )}
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
              color: "#334155",
            }}
          >
            <Sparkles size={24} style={{ color: "rgba(34,211,238,0.2)" }} />
            <p style={{ fontSize: "0.82rem", textAlign: "center" }}>
              Pick a quick action above or ask anything below
            </p>
          </div>
        )}
      </div>

      {/* Controls row (stop / clear) */}
      {(streaming || output) && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 16px 8px",
            flexShrink: 0,
          }}
        >
          {streaming && (
            <button
              onClick={stop}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.08)",
                color: "#ef4444",
                cursor: "pointer",
              }}
            >
              <X size={10} /> Stop
            </button>
          )}
          {!streaming && output && (
            <button
              onClick={() => setOutput("")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.07)",
                background: "transparent",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={10} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Free-form input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(34,211,238,0.08)",
          flexShrink: 0,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              runFreeForm();
            }
          }}
          placeholder="Ask anything about this task… (Enter to send)"
          rows={2}
          disabled={streaming}
          style={{
            flex: 1,
            resize: "none",
            fontSize: "0.8rem",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(34,211,238,0.15)",
            background: "rgba(34,211,238,0.04)",
            color: "#e2e8f0",
            outline: "none",
            lineHeight: 1.5,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={runFreeForm}
          disabled={streaming || !prompt.trim()}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "none",
            background:
              streaming || !prompt.trim() ? "rgba(34,211,238,0.08)" : "#22d3ee",
            color: streaming || !prompt.trim() ? "#475569" : "#08050f",
            cursor: streaming || !prompt.trim() ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {streaming ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>
    </div>
  );
}
