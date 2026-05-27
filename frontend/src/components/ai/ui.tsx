/**
 * Shared UI primitives for the AI Workspace pages.
 * Ported from HRS_AI/frontend/src/components/ui.tsx with minor adaptations.
 */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus, X, ArrowLeft } from "lucide-react";

/* ── StatusBadge ─────────────────────────────────────────────────────────── */

const STATUS_CFG: Record<
  string,
  { cls: string; dot?: string; pulse?: boolean }
> = {
  DEPLOYED: {
    cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  COMPLETED: {
    cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  APPROVED: { cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  REVIEW: { cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  AWAITING_APPROVAL: {
    cls: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  RUNNING: {
    cls: "bg-sky-400/10 text-sky-300 border-sky-400/20",
    dot: "bg-sky-400",
    pulse: true,
  },
  PENDING: { cls: "bg-slate-500/10 text-slate-400 border-slate-500/15" },
  DRAFT: { cls: "bg-slate-500/10 text-slate-400 border-slate-500/15" },
  IDLE: { cls: "bg-slate-500/10 text-slate-400 border-slate-500/15" },
  FAILED: { cls: "bg-red-500/10 text-red-300 border-red-500/20" },
  REJECTED: { cls: "bg-red-500/10 text-red-300 border-red-500/20" },
  ERROR: { cls: "bg-red-500/10 text-red-300 border-red-500/20" },
  ARCHIVED: { cls: "bg-slate-700/20 text-slate-500 border-slate-600/15" },
  PAUSED: { cls: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const cfg = STATUS_CFG[status] ?? {
    cls: "bg-slate-500/10 text-slate-400 border-slate-500/15",
  };
  const pad =
    size === "sm"
      ? "px-1.5 py-0.5 text-[10px] gap-1"
      : "px-2 py-1 text-xs gap-1.5";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded border font-medium font-mono tracking-wide",
        pad,
        cfg.cls,
      )}
    >
      {cfg.dot && (
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          {cfg.pulse && (
            <span
              className={clsx(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
                cfg.dot,
              )}
            />
          )}
          <span
            className={clsx(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              cfg.dot,
            )}
          />
        </span>
      )}
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ── KPICard ─────────────────────────────────────────────────────────────── */

export function KPICard({
  title,
  value,
  unit,
  trend,
  icon: Icon,
  color = "#22d3ee",
}: {
  title: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative rounded-xl p-5 overflow-hidden transition-all duration-200"
      style={{
        background: "rgba(8,14,28,0.9)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="absolute top-0 right-0 w-32 h-32 opacity-[0.06] pointer-events-none rounded-full blur-2xl"
        style={{ background: color, transform: "translate(40%, -40%)" }}
      />
      <div className="flex items-start justify-between mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
          {title}
        </p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}12`, border: `1px solid ${color}25` }}
        >
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p
        className="text-3xl font-black tracking-tight"
        style={{ color: "#e8f0fe", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
        {unit && (
          <span className="text-sm font-normal text-slate-500 ml-1.5">
            {unit}
          </span>
        )}
      </p>
      {trend && (
        <div
          className={clsx(
            "flex items-center gap-1 mt-3 text-xs font-medium",
            trend === "up"
              ? "text-emerald-400"
              : trend === "down"
                ? "text-red-400"
                : "text-slate-500",
          )}
        >
          {trend === "up" ? (
            <TrendingUp size={11} />
          ) : trend === "down" ? (
            <TrendingDown size={11} />
          ) : (
            <Minus size={11} />
          )}
          {trend === "up"
            ? "Above target"
            : trend === "down"
              ? "Below target"
              : "On target"}
        </div>
      )}
    </motion.div>
  );
}

/* ── Avatar ──────────────────────────────────────────────────────────────── */

export function Avatar({
  initials,
  color,
  size = "md",
}: {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const sz =
    size === "sm"
      ? "w-7 h-7 text-xs"
      : size === "lg"
        ? "w-12 h-12 text-base"
        : "w-9 h-9 text-sm";
  return (
    <div
      className={clsx(
        "rounded-lg flex items-center justify-center font-black flex-shrink-0",
        sz,
      )}
      style={{
        background: `${color}14`,
        color,
        border: `1px solid ${color}25`,
      }}
    >
      {initials}
    </div>
  );
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : "w-5 h-5";
  return (
    <motion.div
      className={clsx("rounded-full border-2 border-white/[0.06]", sz)}
      style={{ borderTopColor: "#22d3ee" }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* ── EmptyState ──────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", delay: 0.05 }}
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
        style={{
          background: "rgba(34,211,238,0.05)",
          border: "1px solid rgba(34,211,238,0.12)",
        }}
      >
        <Icon size={22} style={{ color: "rgba(34,211,238,0.5)" }} />
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="text-sm font-bold text-slate-300 mb-2"
      >
        {title}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="text-sm text-slate-500 max-w-xs mb-6 leading-relaxed"
      >
        {description}
      </motion.p>
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
        >
          <button
            onClick={action.onClick}
            className="btn-arc text-xs px-4 py-2"
          >
            {action.label}
          </button>
        </motion.div>
      )}
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const maxW =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-black/80"
            style={{ backdropFilter: "blur(16px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={clsx("relative z-10 w-full rounded-xl", maxW)}
            style={{
              background: "#0d1628",
              border: "1px solid rgba(34,211,238,0.15)",
              boxShadow: "0 4px 32px -8px rgba(0,0,0,0.8)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <h2 className="text-sm font-bold text-slate-100">{title}</h2>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.07] transition-all"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  action,
  backTo,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backTo?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="mb-7">
      {backTo && (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold mb-4 transition-colors"
          style={{ color: "var(--text-2)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
        >
          <ArrowLeft size={13} /> Back
        </button>
      )}
      <div className="flex items-start justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="text-lg font-black text-slate-50 tracking-tight leading-tight"
          >
            {title}
          </motion.h1>
          {description && (
            <motion.p
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                delay: 0.08,
              }}
              className="text-sm mt-1"
              style={{ color: "var(--text-2)" }}
            >
              {description}
            </motion.p>
          )}
        </div>
        {action && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              delay: 0.05,
            }}
            className="flex-shrink-0 ml-4"
          >
            {action}
          </motion.div>
        )}
      </div>
    </div>
  );
}
