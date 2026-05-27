import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { motion } from "framer-motion";
import aiApi from "../../api/aiApi";
import {
  Spinner,
  Avatar,
  StatusBadge,
  EmptyState,
  PageHeader,
} from "../../components/ai/ui";
import type { Persona, Department } from "../../types/ai";

export default function PersonasPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState<number | null>(null);

  const { data: personas, isLoading } = useQuery<Persona[]>({
    queryKey: ["personas"],
    queryFn: () => aiApi.get("/personas").then((r) => r.data),
  });
  const { data: departments } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => aiApi.get("/departments").then((r) => r.data),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );

  const filtered = (personas ?? []).filter((p) => {
    const ms = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const md = deptId === null || p.department_id === deptId;
    return ms && md;
  });

  return (
    <div>
      <PageHeader
        title="Personas"
        description={`${personas?.length ?? 0} role-based AI avatars`}
        backTo="/projects"
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="field pl-8 py-2 w-48 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setDeptId(null)}
            className={
              deptId === null
                ? "btn-arc text-xs py-1.5 px-3"
                : "btn-ghost text-xs py-1.5 px-3"
            }
          >
            All
          </button>
          {(departments ?? []).map((dept) => (
            <button
              key={dept.id}
              onClick={() => setDeptId(dept.id === deptId ? null : dept.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={
                deptId === dept.id
                  ? { background: dept.color, color: "#000" }
                  : {
                      background: `${dept.color}10`,
                      color: dept.color,
                      border: `1px solid ${dept.color}25`,
                    }
              }
            >
              {dept.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No personas"
          description={
            search ? `No match for "${search}"` : "No personas in this dept."
          }
          action={
            search
              ? { label: "Clear", onClick: () => setSearch("") }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {filtered.map((persona, i) => {
            const dept = (departments ?? []).find(
              (d) => d.id === persona.department_id,
            );
            return (
              <motion.button
                key={persona.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/ai/personas/${persona.slug}`)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-start gap-3 p-4 rounded-xl text-left group transition-all duration-150"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <Avatar
                  initials={persona.avatar_initials}
                  color={persona.avatar_color}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                    {persona.name}
                  </p>
                  {dept && (
                    <p
                      className="text-xs mt-0.5 mb-1.5 truncate font-medium"
                      style={{ color: dept.color }}
                    >
                      {dept.name}
                    </p>
                  )}
                  <StatusBadge
                    status={persona.skill_status ?? "DRAFT"}
                    size="sm"
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
