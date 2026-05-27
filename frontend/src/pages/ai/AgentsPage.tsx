import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Database,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import aiApi from "../../api/aiApi";
import { AI_URL } from "../../api/aiClient";
import {
  Spinner,
  StatusBadge,
  EmptyState,
  Avatar,
  Modal,
  PageHeader,
} from "../../components/ai/ui";
import type { Agent, AgentExecution, Persona } from "../../types/ai";

type Tab = "agents" | "queue" | "approvals";

interface ToolLog {
  name: string;
  input: unknown;
  result?: string;
  status: "calling" | "done" | "error";
}

interface StepLog {
  step: number;
  action: string;
  reasoning: string;
  result: string;
  status: string;
}

function toolService(name: string): { color: string; label: string } {
  if (name.startsWith("jira_")) return { color: "#2684FF", label: "Jira" };
  if (name.startsWith("hrsjira_")) return { color: "#2684FF", label: "Jira" };
  if (name.startsWith("confluence_"))
    return { color: "#8b5cf6", label: "Confluence" };
  return { color: "#22d3ee", label: "Tool" };
}

function inputSummary(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  if (name === "jira_search_issues" || name === "hrsjira_search_tasks")
    return String(inp.jql ?? inp.q ?? "");
  if (name === "jira_get_issue" || name === "hrsjira_get_task")
    return String(inp.issue_key ?? inp.task_id ?? "");
  return JSON.stringify(input).slice(0, 60);
}

function ToolLogRow({ tc }: { tc: ToolLog }) {
  const [open, setOpen] = useState(false);
  const svc = toolService(tc.name);
  const opName = tc.name
    .replace(/^(jira_|hrsjira_|confluence_)/, "")
    .replace(/_/g, " ");

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded font-mono"
          style={{
            background: svc.color + "22",
            color: svc.color,
            border: `1px solid ${svc.color}33`,
          }}
        >
          {svc.label}
        </span>
        <span className="text-xs text-slate-300 flex-1 truncate">{opName}</span>
        <span className="text-[10px] text-slate-600 truncate max-w-[140px] font-mono">
          {inputSummary(tc.name, tc.input)}
        </span>
        <span className="ml-2 flex-shrink-0">
          {tc.status === "calling" && <Spinner size="sm" />}
          {tc.status === "done" && (
            <CheckCircle size={11} className="text-emerald-400" />
          )}
          {tc.status === "error" && (
            <XCircle size={11} className="text-red-400" />
          )}
        </span>
        {open ? (
          <ChevronDown size={11} className="text-slate-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-slate-600 flex-shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">
                  Input
                </p>
                <pre
                  className="text-[10px] font-mono text-slate-400 overflow-auto max-h-28 rounded p-2"
                  style={{ background: "rgba(0,0,0,0.3)" }}
                >
                  {JSON.stringify(tc.input, null, 2)}
                </pre>
              </div>
              {tc.result && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">
                    Result
                  </p>
                  <pre
                    className="text-[10px] font-mono text-slate-400 overflow-auto max-h-40 rounded p-2"
                    style={{ background: "rgba(0,0,0,0.3)" }}
                  >
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(tc.result!), null, 2);
                      } catch {
                        return tc.result;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("agents");
  const [runModal, setRunModal] = useState(false);
  const [selAgent, setSelAgent] = useState<Agent | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [actioning, setActioning] = useState<number | null>(null);

  // Live execution state
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [steps, setSteps] = useState<StepLog[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [executionId, setExecutionId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const { data: agents, isLoading: la } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => aiApi.get("/agents").then((r) => r.data),
  });
  const { data: executions, isLoading: le } = useQuery<AgentExecution[]>({
    queryKey: ["executions-all"],
    queryFn: () => aiApi.get("/agents/executions/all").then((r) => r.data),
    refetchInterval: 5000,
  });
  const { data: personas } = useQuery<Persona[]>({
    queryKey: ["personas"],
    queryFn: () => aiApi.get("/personas").then((r) => r.data),
  });

  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [steps, toolLogs]);

  function resetLive() {
    setIsRunning(false);
    setIsDone(false);
    setSteps([]);
    setToolLogs([]);
    setExecutionId(null);
  }

  function openModal(agent: Agent) {
    resetLive();
    setSelAgent(agent);
    setTaskName("");
    setTaskDesc("");
    setRunModal(true);
  }

  function closeModal() {
    if (isRunning) abortRef.current?.abort();
    setRunModal(false);
    setSelAgent(null);
    resetLive();
  }

  async function runTask() {
    if (!selAgent || !taskName.trim()) return;
    resetLive();
    setIsRunning(true);

    const token = localStorage.getItem("taskflow_token");
    if (!token) {
      toast.error("Not authenticated");
      setIsRunning(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(`${AI_URL}/api/agents/${selAgent.id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_name: taskName,
          input: { description: taskDesc },
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        toast.error("Failed to start task");
        setIsRunning(false);
        return;
      }

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw);

            if (ev.type === "step") {
              const s = ev.step as StepLog;
              const action: string = s.action ?? "";

              if (action.startsWith("Call tool:")) {
                const toolName = action.replace("Call tool:", "").trim();
                let input: unknown = {};
                try {
                  input = JSON.parse(
                    (s.reasoning ?? "").replace(/^Using .+ with: /, ""),
                  );
                } catch {}
                setToolLogs((prev) => [
                  ...prev,
                  { name: toolName, input, status: "calling" },
                ]);
              } else if (action.startsWith("Tool result:")) {
                const toolName = action.replace("Tool result:", "").trim();
                setToolLogs((prev) => {
                  const copy = [...prev];
                  const idx = [...copy]
                    .reverse()
                    .findIndex(
                      (t) => t.name === toolName && t.status === "calling",
                    );
                  if (idx !== -1) {
                    const real = copy.length - 1 - idx;
                    copy[real] = {
                      ...copy[real],
                      result: s.result,
                      status: s.result?.includes('"error"') ? "error" : "done",
                    };
                  }
                  return copy;
                });
              } else {
                setSteps((prev) => [...prev, s]);
              }
            }

            if (ev.type === "done") {
              setExecutionId(ev.execution_id ?? null);
              setIsRunning(false);
              setIsDone(true);
              qc.invalidateQueries({ queryKey: ["executions-all"] });
            }

            if (ev.type === "error") {
              toast.error(ev.message ?? "Agent error");
              setIsRunning(false);
              setIsDone(true);
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError")
        toast.error("Stream disconnected");
      setIsRunning(false);
    }
  }

  async function approveExec(id: number) {
    setActioning(id);
    try {
      await aiApi.post(`/agents/executions/${id}/approve`);
      qc.invalidateQueries({ queryKey: ["executions-all"] });
      toast.success("Approved");
    } catch {
      toast.error("Failed");
    } finally {
      setActioning(null);
    }
  }

  async function rejectExec(id: number) {
    setActioning(id);
    try {
      await aiApi.post(`/agents/executions/${id}/reject`);
      qc.invalidateQueries({ queryKey: ["executions-all"] });
      toast.success("Rejected");
    } catch {
      toast.error("Failed");
    } finally {
      setActioning(null);
    }
  }

  const queueExecs = (executions ?? []).filter((e) =>
    ["RUNNING", "PENDING", "APPROVED"].includes(e.status),
  );
  const approvalExecs = (executions ?? []).filter(
    (e) => e.status === "AWAITING_APPROVAL",
  );
  const getPersona = (pid: number) =>
    (personas ?? []).find((p) => p.id === pid);

  const TABS = [
    { id: "agents" as Tab, label: "All Agents" },
    { id: "queue" as Tab, label: "Queue", count: queueExecs.length },
    { id: "approvals" as Tab, label: "Approvals", count: approvalExecs.length },
  ];

  const hasLiveContent = steps.length > 0 || toolLogs.length > 0;

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Manage and monitor your AI agents"
        backTo="/projects"
        action={
          approvalExecs.length > 0 ? (
            <span
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(245,158,11,0.1)",
                color: "#f59e0b",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <AlertTriangle size={11} /> {approvalExecs.length} awaiting
            </span>
          ) : undefined
        }
      />

      {/* tabs */}
      <div
        className="flex gap-1 mb-5 p-1 rounded-lg w-fit"
        style={{ background: "var(--surface-2)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
            style={
              tab === t.id
                ? {
                    background: "#22d3ee",
                    color: "#08050f",
                    boxShadow: "0 0 12px -3px rgba(34,211,238,0.25)",
                  }
                : { color: "#64748b" }
            }
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center ${t.id === "approvals" ? "bg-amber-400 text-black" : "bg-white/20 text-white"}`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* All Agents */}
      {tab === "agents" &&
        (la ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !agents?.length ? (
          <EmptyState
            icon={Bot}
            title="No agents"
            description="No agents configured yet."
          />
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--surface-1)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <table className="w-full">
              <thead>
                <tr
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  {["Agent", "Persona", "Department", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className={`text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 px-4 py-3 ${!h && "text-right"} ${h === "Persona" && "hidden md:table-cell"} ${h === "Department" && "hidden md:table-cell"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const persona = getPersona(agent.persona_id);
                  return (
                    <tr
                      key={agent.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(34,211,238,0.02)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "")
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                              background: "rgba(34,211,238,0.08)",
                              border: "1px solid rgba(34,211,238,0.15)",
                            }}
                          >
                            <Bot size={14} style={{ color: "#22d3ee" }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-200">
                              {agent.name}
                            </p>
                            {agent.last_active && (
                              <p className="text-[10px] font-mono text-slate-600">
                                Active{" "}
                                {new Date(
                                  agent.last_active,
                                ).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {persona ? (
                          <div className="flex items-center gap-2">
                            <Avatar
                              initials={persona.avatar_initials}
                              color={persona.avatar_color}
                              size="sm"
                            />
                            <span className="text-sm text-slate-300">
                              {persona.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500 font-mono">
                        {agent.department_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={agent.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openModal(agent)}
                          className="btn-arc text-xs py-1.5 px-3"
                        >
                          <Play size={11} /> Run
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {/* Queue */}
      {tab === "queue" &&
        (le ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : queueExecs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Queue empty"
            description="No executions running or pending."
          />
        ) : (
          <div className="space-y-2">
            {queueExecs.map((exec) => (
              <button
                key={exec.id}
                onClick={() => navigate(`/ai/agents/executions/${exec.id}`)}
                className="w-full text-left rounded-xl p-4 transition-all hover:border-arc/20"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {exec.task_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {exec.agent_name ?? `Agent #${exec.agent_id}`} ·{" "}
                      {exec.persona_name}
                    </p>
                  </div>
                  <StatusBadge status={exec.status} />
                </div>
                {exec.started_at && (
                  <p className="text-[10px] font-mono text-slate-600 mt-2">
                    Started {new Date(exec.started_at).toLocaleString()}
                  </p>
                )}
              </button>
            ))}
          </div>
        ))}

      {/* Approvals */}
      {tab === "approvals" &&
        (le ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : approvalExecs.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No pending approvals"
            description="All executions reviewed."
          />
        ) : (
          <div className="space-y-2">
            {approvalExecs.map((exec) => (
              <motion.div
                key={exec.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-4"
                style={{
                  background: "rgba(245,158,11,0.04)",
                  border: "1px solid rgba(245,158,11,0.15)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {exec.task_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {exec.agent_name ?? `Agent #${exec.agent_id}`} ·{" "}
                      {exec.persona_name}
                    </p>
                  </div>
                  <StatusBadge status={exec.status} />
                </div>
                {exec.input && Object.keys(exec.input).length > 0 && (
                  <pre
                    className="text-xs font-mono text-slate-500 rounded-lg p-2.5 mb-3 overflow-auto max-h-20"
                    style={{
                      background: "var(--surface-0)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {JSON.stringify(exec.input, null, 2)}
                  </pre>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => approveExec(exec.id)}
                    disabled={actioning === exec.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50"
                    style={{ background: "#059669" }}
                  >
                    <CheckCircle size={11} />
                    {actioning === exec.id ? "Working…" : "Approve"}
                  </button>
                  <button
                    onClick={() => rejectExec(exec.id)}
                    disabled={actioning === exec.id}
                    className="btn-danger text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    <XCircle size={11} /> Reject
                  </button>
                  <button
                    onClick={() => navigate(`/ai/agents/executions/${exec.id}`)}
                    className="ml-auto text-xs"
                    style={{ color: "#22d3ee" }}
                  >
                    View →
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ))}

      {/* Run Modal */}
      <Modal
        open={runModal}
        onClose={closeModal}
        title={`Run Task — ${selAgent?.name ?? ""}`}
        size="lg"
      >
        <div className="space-y-4">
          {!isRunning && !isDone && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">
                  Task Name
                </label>
                <input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. Analyse Q2 metrics"
                  className="field w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">
                  Description
                </label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={3}
                  placeholder="What should the agent do?"
                  className="field w-full resize-none"
                />
              </div>
            </>
          )}

          {(isRunning || isDone) && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-200">{taskName}</p>
                {taskDesc && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {taskDesc}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isRunning && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full dot-live" />
                    Running
                  </span>
                )}
                {isDone && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle size={11} className="text-emerald-400" /> Done
                  </span>
                )}
              </div>
            </div>
          )}

          {hasLiveContent && (
            <div className="space-y-3">
              {toolLogs.length > 0 && (
                <div>
                  <p
                    className="text-[9px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                    style={{ color: "var(--text-3)" }}
                  >
                    <Database size={9} /> Tool Calls ({toolLogs.length})
                  </p>
                  <div className="space-y-1">
                    {toolLogs.map((tc, i) => (
                      <ToolLogRow key={i} tc={tc} />
                    ))}
                  </div>
                </div>
              )}
              {steps.length > 0 && (
                <div
                  ref={outputRef}
                  className="max-h-52 overflow-auto space-y-2 rounded-lg p-3"
                  style={{
                    background: "var(--surface-0)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {steps.map((s, i) => (
                    <div key={i} className="text-xs">
                      <p className="font-bold text-slate-300">{s.action}</p>
                      {s.reasoning && (
                        <p className="text-slate-500 mt-0.5">{s.reasoning}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {executionId && (
            <button
              onClick={() => {
                closeModal();
                navigate(`/ai/agents/executions/${executionId}`);
              }}
              className="w-full text-xs py-2 rounded-lg transition-all"
              style={{
                background: "rgba(34,211,238,0.07)",
                color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.2)",
              }}
            >
              View Execution Details →
            </button>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {!isRunning && !isDone && (
              <button
                onClick={runTask}
                disabled={!taskName.trim()}
                className="btn-arc text-sm disabled:opacity-50"
              >
                <Play size={13} /> Run
              </button>
            )}
            {isRunning && (
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setIsRunning(false);
                }}
                className="btn-danger text-sm"
              >
                Stop
              </button>
            )}
            <button onClick={closeModal} className="btn-ghost text-sm">
              {isDone ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
