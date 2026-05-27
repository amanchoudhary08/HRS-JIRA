import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  CheckCheck,
  AlertTriangle,
  Circle,
  Square,
} from "lucide-react";
import toast from "react-hot-toast";
import aiApi from "../../api/aiApi";
import { Spinner, StatusBadge } from "../../components/ai/ui";
import type { AgentExecution } from "../../types/ai";

function StepIcon({ status }: { status: string }) {
  if (status === "COMPLETED" || status === "SUCCESS")
    return <CheckCheck size={13} className="text-emerald-400" />;
  if (status === "FAILED" || status === "ERROR")
    return <AlertTriangle size={13} className="text-red-400" />;
  if (status === "RUNNING")
    return (
      <div
        className="w-3 h-3 rounded-full border-[1.5px] border-t-transparent animate-spin"
        style={{ borderColor: "#22d3ee", borderTopColor: "transparent" }}
      />
    );
  return <Circle size={13} className="text-slate-600" />;
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [actioning, setActioning] = useState<string | null>(null);

  const { data: execution, isLoading } = useQuery<AgentExecution | null>({
    queryKey: ["execution", id],
    queryFn: async () => {
      const r = await aiApi.get("/agents/executions/all");
      return (
        (r.data as AgentExecution[]).find((e) => String(e.id) === id) ?? null
      );
    },
    refetchInterval: (q) => {
      const s = (q.state.data as AgentExecution | null)?.status;
      return s && ["RUNNING", "PENDING", "AWAITING_APPROVAL"].includes(s)
        ? 3000
        : false;
    },
  });

  async function stop() {
    if (!id) return;
    setActioning("stop");
    try {
      await aiApi.post(`/agents/executions/${id}/cancel`);
      await qc.invalidateQueries({ queryKey: ["execution", id] });
      await qc.invalidateQueries({ queryKey: ["executions-all"] });
      toast.success("Stopped");
    } catch (e: unknown) {
      if ((e as { response?: { status: number } })?.response?.status === 409) {
        await qc.invalidateQueries({ queryKey: ["execution", id] });
      } else {
        toast.error("Failed");
      }
    } finally {
      setActioning(null);
    }
  }

  async function approve() {
    if (!id) return;
    setActioning("approve");
    try {
      await aiApi.post(`/agents/executions/${id}/approve`);
      qc.invalidateQueries({ queryKey: ["execution", id] });
      toast.success("Approved");
    } catch {
      toast.error("Failed");
    } finally {
      setActioning(null);
    }
  }

  async function reject() {
    if (!id) return;
    setActioning("reject");
    try {
      await aiApi.post(`/agents/executions/${id}/reject`);
      qc.invalidateQueries({ queryKey: ["execution", id] });
      toast.success("Rejected");
    } catch {
      toast.error("Failed");
    } finally {
      setActioning(null);
    }
  }

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  if (!execution)
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Execution not found.</p>
        <button
          onClick={() => navigate("/ai/agents")}
          className="text-sm mt-2 hover:underline"
          style={{ color: "#22d3ee" }}
        >
          Back to agents
        </button>
      </div>
    );

  return (
    <div>
      <button
        onClick={() => navigate("/ai/agents")}
        className="flex items-center gap-1.5 text-xs font-semibold mb-4 transition-colors text-slate-500 hover:text-slate-200"
      >
        <ArrowLeft size={13} /> Back to Agents
      </button>

      {/* header card */}
      <div
        className="rounded-xl p-5 mb-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-base font-black text-white">
              {execution.task_name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {execution.agent_name ?? `Agent #${execution.agent_id}`}
              {execution.persona_name && ` · ${execution.persona_name}`}
            </p>
          </div>
          <StatusBadge status={execution.status} />
        </div>
        <div className="flex flex-wrap gap-4 text-[10px] font-mono text-slate-600">
          {execution.started_at && (
            <span>
              Started: {new Date(execution.started_at).toLocaleString()}
            </span>
          )}
          {execution.completed_at && (
            <span>
              Completed: {new Date(execution.completed_at).toLocaleString()}
            </span>
          )}
        </div>

        {(execution.status === "RUNNING" || execution.status === "PENDING") && (
          <div
            className="flex gap-2 mt-4 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <button
              onClick={stop}
              disabled={actioning === "stop"}
              className="btn-danger text-xs disabled:opacity-50"
            >
              <Square size={11} /> {actioning === "stop" ? "Stopping…" : "Stop"}
            </button>
          </div>
        )}
        {execution.status === "AWAITING_APPROVAL" && (
          <div
            className="flex gap-2 mt-4 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <button
              onClick={approve}
              disabled={actioning === "approve"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50"
              style={{ background: "#059669" }}
            >
              <CheckCircle size={11} />{" "}
              {actioning === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={reject}
              disabled={actioning === "reject"}
              className="btn-danger text-xs disabled:opacity-50"
            >
              <XCircle size={11} />{" "}
              {actioning === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        {[
          { label: "Input", data: execution.input },
          { label: "Output", data: execution.output },
        ].map(({ label, data }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{
              background: "var(--surface-1)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <p className="section-title">{label}</p>
            {data ? (
              <pre
                className="text-xs font-mono text-slate-400 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {JSON.stringify(data, null, 2)}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-20 text-xs text-slate-600">
                {["RUNNING", "PENDING", "APPROVED"].includes(
                  execution.status,
                ) ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" /> In progress…
                  </span>
                ) : (
                  "No output"
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {execution.steps && execution.steps.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <p className="section-title">Execution Steps</p>
          <div className="space-y-0">
            {execution.steps.map((step, i) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid rgba(34,211,238,0.1)",
                    }}
                  >
                    <StepIcon status={step.status} />
                  </div>
                  {i < execution.steps.length - 1 && (
                    <div
                      className="w-px flex-1 my-1"
                      style={{
                        background: "rgba(34,211,238,0.06)",
                        minHeight: 20,
                      }}
                    />
                  )}
                </div>
                <div
                  className={`flex-1 ${i === execution.steps.length - 1 ? "pb-0" : "pb-5"}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-bold text-slate-200">
                      <span className="text-slate-600 mr-2 font-mono text-xs">
                        #{step.step_number}
                      </span>
                      {step.action}
                    </p>
                    {step.duration_ms && (
                      <span className="text-[10px] font-mono text-slate-600 flex items-center gap-1 ml-2">
                        <Clock size={9} /> {step.duration_ms}ms
                      </span>
                    )}
                  </div>
                  {step.reasoning && (
                    <p className="text-xs text-slate-500 leading-relaxed mb-2">
                      {step.reasoning}
                    </p>
                  )}
                  {step.result && (
                    <pre
                      className="text-xs font-mono text-slate-400 rounded-lg p-2.5 overflow-auto max-h-24 whitespace-pre-wrap"
                      style={{
                        background: "var(--surface-0)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {step.result}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
