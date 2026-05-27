import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wand2, Save, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import aiApi from "../../api/aiApi";
import { AI_URL } from "../../api/aiClient";
import { Spinner, Avatar } from "../../components/ai/ui";
import type { Persona } from "../../types/ai";

export default function SkillGeneratePage() {
  const { personaId } = useParams<{ personaId: string }>();
  const navigate = useNavigate();

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const { data: persona, isLoading } = useQuery<Persona | null>({
    queryKey: ["persona-by-id", personaId],
    queryFn: async () => {
      const all: Persona[] = (await aiApi.get("/personas")).data;
      return all.find((p) => String(p.id) === personaId) ?? null;
    },
    enabled: !!personaId,
  });

  async function generate() {
    if (!personaId) return;
    setGenerating(true);
    setGenerated("");
    setDone(false);
    setProgress(0);
    try {
      const token = localStorage.getItem("taskflow_token");
      const response = await fetch(
        `${AI_URL}/api/skills/generate/${personaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok || !response.body) throw new Error("Generation failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done: sd, value } = await reader.read();
        if (sd) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || data === "done") {
            setDone(true);
            setProgress(100);
          } else {
            try {
              const p = JSON.parse(data);
              if (p.text || p.content) {
                setGenerated((prev) => prev + (p.text ?? p.content));
                setProgress((prev) => Math.min(prev + 2, 95));
              }
            } catch {
              setGenerated((prev) => prev + data);
              setProgress((prev) => Math.min(prev + 1, 95));
            }
          }
        }
      }
      setDone(true);
      setProgress(100);
    } catch {
      toast.error("Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  async function saveSkill() {
    if (!persona) return;
    setSaving(true);
    toast.success("Skill file generated and saved as draft");
    navigate(`/ai/personas/${persona.slug}`);
    setSaving(false);
  }

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs font-semibold mb-4 transition-colors text-slate-500 hover:text-slate-200"
      >
        <ArrowLeft size={13} /> Back
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-black text-white">Generate Skill File</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
          Use AI to create a structured skill specification for this persona
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Persona info */}
        <div className="lg:col-span-2 space-y-3">
          {persona && (
            <>
              <div
                className="rounded-xl p-4"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <Avatar
                    initials={persona.avatar_initials}
                    color={persona.avatar_color}
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {persona.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {persona.department?.name}
                    </p>
                  </div>
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--text-2)" }}
                >
                  {persona.description}
                </p>
              </div>

              {persona.responsibilities?.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <p className="section-title">Responsibilities</p>
                  <ul className="space-y-1.5">
                    {persona.responsibilities.slice(0, 6).map((r, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-slate-400"
                      >
                        <span style={{ color: "#22d3ee" }}>·</span>
                        {r}
                      </li>
                    ))}
                    {persona.responsibilities.length > 6 && (
                      <li className="text-xs text-slate-600">
                        +{persona.responsibilities.length - 6} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {persona.data_access?.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <p className="section-title">Data Access</p>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.data_access.map((d, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{
                          background: "rgba(34,211,238,0.07)",
                          color: "#22d3ee",
                          border: "1px solid rgba(34,211,238,0.15)",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Generation panel */}
        <div className="lg:col-span-3">
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-200">
                Generated Content
              </p>
              {done && generated && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle size={11} /> Done
                </span>
              )}
            </div>

            {generating && (
              <div className="mb-4">
                <div
                  className="h-[3px] rounded-full overflow-hidden"
                  style={{ background: "rgba(34,211,238,0.1)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      background: "#22d3ee",
                      boxShadow: "0 0 8px rgba(34,211,238,0.5)",
                    }}
                  />
                </div>
                <p
                  className="text-[10px] font-mono mt-1"
                  style={{ color: "var(--text-3)" }}
                >
                  Generating… {progress}%
                </p>
              </div>
            )}

            <pre
              className="w-full h-96 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap mb-4"
              style={{
                background: "var(--surface-0)",
                border: "1px solid rgba(34,211,238,0.08)",
              }}
            >
              {generated || (
                <span className="text-slate-600">
                  Click "Generate" to create an AI-powered skill specification
                  for {persona?.name ?? "this persona"}…
                </span>
              )}
              {generating && (
                <span className="animate-pulse" style={{ color: "#22d3ee" }}>
                  █
                </span>
              )}
            </pre>

            <div className="flex gap-2">
              <button
                onClick={generate}
                disabled={generating}
                className="btn-arc text-sm disabled:opacity-50"
              >
                <Wand2 size={13} />{" "}
                {generating ? "Generating…" : "Generate Skill File"}
              </button>
              {done && generated && (
                <button
                  onClick={saveSkill}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(16,185,129,0.1)",
                    color: "#10b981",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <Save size={13} /> {saving ? "Saving…" : "Save as Draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
