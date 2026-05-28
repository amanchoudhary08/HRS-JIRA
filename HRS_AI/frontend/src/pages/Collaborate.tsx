/**
 * Collaborate — mission-board layout
 *
 * Left rail: session list (slim, card-per-session)
 * Right main: context-aware panel
 *   • No session selected → hero CTA
 *   • PENDING → problem statement + big Run button
 *   • RUNNING → live mission board — agent cards arranged in a grid,
 *               each streaming their own output in real time,
 *               plus a slim orchestrator banner at top
 *   • COMPLETED → tabbed synthesis view (summary / agent outputs / log)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Play, Square, RefreshCw, Trash2, Edit3, X, Check,
  ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle,
  Clock, Brain, Bot, Wrench, Sparkles, Download, AlertTriangle,
  Zap, Network, FileText, ExternalLink, Database, Search, TicketCheck,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import { Spinner } from '../components/ui'

/* ─── types ─────────────────────────────────────────────────────────────────── */
interface CollabSession {
  id: number; title: string; problem_statement: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  created_by: number | null
  jira_project_key: string | null; confluence_space_key: string | null
  orchestrator_plan: PlanItem[] | null; synthesis_output: string | null
  agent_outputs: Record<string, string> | null
  jira_epic: any; confluence_page: any
  created_at: string | null; updated_at: string | null
  messages?: CollabMsg[]
}
interface PlanItem {
  agent_id?: number; persona_name?: string; role_label?: string; role_slug?: string; task: string
}
interface CollabMsg {
  id: number; sequence: number
  role: 'ORCHESTRATOR' | 'AGENT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'SYNTHESIS' | 'SYSTEM'
  agent_id: number | null; agent_name: string | null; persona_name: string | null
  content: string; tool_name: string | null
  tool_input: Record<string, any> | null; tool_result: string | null; created_at: string | null
}
interface SSEEvent {
  type: string; role_slug?: string; role_label?: string; content?: string
  agent_id?: number | null; agent_name?: string; persona_name?: string
  department?: string; task?: string; output?: string; plan?: PlanItem[]
  tool_name?: string; tool_input?: Record<string, any>; result?: string
  synthesis_text?: string; session_id?: number; message?: string; code?: string
  available_agents?: Array<{ agent_id: number; persona_name: string; department: string }>
}

/* ─── helpers ────────────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('access_token') ?? '' }
function timeAgo(iso: string | null) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`
}

/* ─── tool icon helper ───────────────────────────────────────────────────────── */
function toolIcon(name: string) {
  if (name.startsWith('jira_search') || name.startsWith('confluence_search')) return <Search size={10} />
  if (name.startsWith('jira_list') || name.startsWith('confluence_list')) return <Database size={10} />
  if (name.startsWith('jira_get') || name.startsWith('confluence_get')) return <ExternalLink size={10} />
  if (name.startsWith('jira_create') || name.startsWith('confluence_create')) return <TicketCheck size={10} />
  return <Wrench size={10} />
}

function toolService(name: string): { label: string; color: string; bg: string; border: string } {
  if (name.startsWith('jira_'))        return { label: 'Jira',       color: '#60a5fa', bg: 'rgba(96,165,250,0.07)',  border: 'rgba(96,165,250,0.2)' }
  if (name.startsWith('confluence_'))  return { label: 'Confluence', color: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.2)' }
  return { label: 'Tool', color: '#fbbf24', bg: 'rgba(251,191,36,0.07)', border: 'rgba(251,191,36,0.2)' }
}

function ToolCallRow({ tc }: { tc: ToolCallEntry }) {
  const [open, setOpen] = useState(false)
  const svc = toolService(tc.name)

  let resultPreview = ''
  let resultParsed: any = null
  if (tc.result) {
    try {
      resultParsed = JSON.parse(tc.result)
      if (Array.isArray(resultParsed)) {
        resultPreview = `${resultParsed.length} result${resultParsed.length !== 1 ? 's' : ''}`
      } else if (resultParsed?.error) {
        resultPreview = `Error: ${resultParsed.error}`
      } else if (resultParsed?.key) {
        resultPreview = resultParsed.key + (resultParsed.summary ? ` — ${resultParsed.summary}` : '')
      } else if (resultParsed?.title) {
        resultPreview = resultParsed.title
      } else {
        resultPreview = tc.result.slice(0, 80)
      }
    } catch {
      resultPreview = tc.result.slice(0, 80)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="rounded-lg overflow-hidden"
      style={{ border: `1px solid ${svc.border}`, background: svc.bg }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {/* service badge */}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: `${svc.color}18`, color: svc.color, border: `1px solid ${svc.color}30` }}>
          {svc.label}
        </span>
        {/* icon + name */}
        <span className="flex items-center gap-1 text-[10px] font-mono flex-shrink-0" style={{ color: svc.color }}>
          {toolIcon(tc.name)}
          {tc.name.replace(/^(jira_|confluence_)/, '')}
        </span>
        {/* input summary */}
        <span className="text-[10px] text-slate-600 truncate flex-1 ml-1">
          {tc.input && Object.values(tc.input)[0] != null
            ? String(Object.values(tc.input)[0]).slice(0, 50)
            : ''}
        </span>
        {/* status */}
        <span className="flex-shrink-0 ml-1">
          {tc.status === 'calling' && <Loader2 size={9} className="animate-spin text-amber-400" />}
          {tc.status === 'done'    && <CheckCircle size={9} className="text-emerald-400" />}
          {tc.status === 'error'   && <XCircle size={9} className="text-red-400" />}
        </span>
        <span className="text-slate-700 flex-shrink-0">{open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-2.5 pb-2.5 space-y-2 border-t" style={{ borderColor: `${svc.color}15` }}>
              {/* input */}
              <div className="mt-2">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: `${svc.color}80` }}>Input</p>
                <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed bg-black/20 rounded p-2">
                  {JSON.stringify(tc.input, null, 2)}
                </pre>
              </div>
              {/* result */}
              {tc.result && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: `${svc.color}80` }}>
                    Result {resultPreview && <span className="normal-case font-normal text-slate-500">— {resultPreview}</span>}
                  </p>
                  <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed bg-black/20 rounded p-2 max-h-48 overflow-y-auto">
                    {resultParsed ? JSON.stringify(resultParsed, null, 2) : tc.result}
                  </pre>
                </div>
              )}
              {tc.status === 'calling' && !tc.result && (
                <p className="text-[10px] text-amber-500/60 italic flex items-center gap-1">
                  <Loader2 size={8} className="animate-spin" /> Waiting for response…
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── per-agent streaming card ──────────────────────────────────────────────── */
interface ToolCallEntry {
  name: string
  input: any
  result?: string   // populated when tool_result arrives
  status: 'calling' | 'done' | 'error'
}

interface AgentCardData {
  key: string; label: string; personaName?: string; department?: string
  task?: string; status: 'queued' | 'thinking' | 'done' | 'error'
  output: string; toolCalls: ToolCallEntry[]
}

function AgentCard({ agent, accentColor }: { agent: AgentCardData; accentColor: string }) {
  const [expanded, setExpanded] = useState(true)
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as new chunks arrive
  useEffect(() => {
    if (agent.status === 'thinking' && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [agent.output, agent.status])

  const statusConfig = {
    queued:   { label: 'Queued',    icon: <Clock size={10} />,  color: 'text-slate-500' },
    thinking: { label: 'Working…', icon: <Loader2 size={10} className="animate-spin" />, color: 'text-indigo-300' },
    done:     { label: 'Done',     icon: <CheckCircle size={10} />, color: 'text-emerald-400' },
    error:    { label: 'Error',    icon: <XCircle size={10} />, color: 'text-red-400' },
  }
  const sc = statusConfig[agent.status]
  const initials = agent.label.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="flex flex-col rounded-2xl overflow-hidden border transition-all duration-300"
      style={{
        background: agent.status === 'thinking'
          ? `linear-gradient(135deg, ${accentColor}0d, rgba(255,255,255,0.02))`
          : agent.status === 'done'
            ? 'rgba(52,211,153,0.04)'
            : 'rgba(255,255,255,0.02)',
        borderColor: agent.status === 'thinking'
          ? `${accentColor}33`
          : agent.status === 'done' ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)',
        boxShadow: agent.status === 'thinking' ? `0 0 24px ${accentColor}14` : undefined,
      }}
    >
      {/* card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left w-full"
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
          style={{
            background: `${accentColor}22`,
            border: `1.5px solid ${accentColor}44`,
            color: accentColor,
            boxShadow: agent.status === 'thinking' ? `0 0 14px ${accentColor}33` : undefined,
          }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white">{agent.label}</span>
            <span className={clsx('flex items-center gap-1 text-[10px] font-medium flex-shrink-0', sc.color)}>
              {sc.icon}{sc.label}
            </span>
          </div>
          {agent.task && (
            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{agent.task}</p>
          )}
        </div>

        <span className="text-slate-700 flex-shrink-0">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>

      {/* tool call log */}
      <AnimatePresence>
        {expanded && agent.toolCalls.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5 border-t" style={{ borderColor: 'rgba(251,191,36,0.1)', background: 'rgba(251,191,36,0.02)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/60 pt-2.5 flex items-center gap-1.5">
                <Database size={9} /> Tool Calls
              </p>
              {agent.toolCalls.map((tc, i) => (
                <ToolCallRow key={i} tc={tc} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* streaming output — full height, scrollable */}
      <AnimatePresence>
        {expanded && (agent.output || agent.status === 'thinking') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              ref={outputRef}
              className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t overflow-y-auto"
              style={{
                borderColor: 'rgba(255,255,255,0.04)',
                maxHeight: '400px',
                background: 'rgba(0,0,0,0.25)',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              <div className="mt-3 whitespace-pre-wrap break-words">
                {agent.output}
                {agent.status === 'thinking' && agent.output && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                    className="inline-block w-1.5 h-3 ml-0.5 align-text-bottom rounded-sm"
                    style={{ background: accentColor }}
                  />
                )}
                {agent.status === 'thinking' && !agent.output && (
                  <span className="text-slate-600 italic">Processing…</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── orchestrator banner ────────────────────────────────────────────────────── */
function OrchestratorBanner({
  text, planCount, done,
}: { text: string; planCount: number; done: boolean }) {
  const [expanded, setExpanded] = useState(false)

  // Strip the ```json ... ``` block — it's for machines, not humans
  const displayText = text.replace(/```json[\s\S]*?```/g, '').trim()

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 mb-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(99,102,241,0.08))',
        border: '1px solid rgba(139,92,246,0.25)',
      }}
    >
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%,#8b5cf6,transparent 60%)' }} />
      <div className="relative flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', boxShadow: '0 0 16px rgba(139,92,246,0.4)' }}>
          <Brain size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">Orchestrator</span>
            {done ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
                <CheckCircle size={9} /> {planCount} agents assigned
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-2 py-0.5">
                <Loader2 size={9} className="animate-spin" /> Planning…
              </span>
            )}
            {displayText && done && (
              <button onClick={() => setExpanded(e => !e)}
                className="ml-auto text-[10px] text-violet-400 hover:text-violet-200 transition-colors flex items-center gap-1">
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {expanded ? 'collapse' : 'expand'}
              </button>
            )}
          </div>
          {displayText && (
            <AnimatePresence initial={false}>
              {(!done || expanded) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{displayText}</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          {done && !expanded && displayText && (
            <p className="text-[10px] text-slate-500 italic">Rationale hidden — click expand to read</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── synthesis view ─────────────────────────────────────────────────────────── */
function SynthesisView({ session }: { session: CollabSession }) {
  const [tab, setTab] = useState<'summary' | 'agents' | 'log'>('summary')
  const { data: detail } = useQuery<CollabSession>({
    queryKey: ['collab-detail', session.id],
    queryFn: () => api.get(`/collaborations/${session.id}`).then(r => r.data),
    enabled: session.status === 'COMPLETED' || session.status === 'FAILED',
  })

  async function exportMd() {
    try {
      const resp = await api.get(`/collaborations/${session.id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = Object.assign(document.createElement('a'), { href: url, download: `${session.title.slice(0, 40).replace(/\s+/g, '_')}.md` })
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  const TABS = [
    { key: 'summary', label: 'Summary', icon: <FileText size={12} /> },
    { key: 'agents',  label: 'Agent Outputs', icon: <Bot size={12} /> },
    { key: 'log',     label: 'Message Log', icon: <Network size={12} /> },
  ] as const

  return (
    <div className="flex flex-col h-full">
      {/* tab bar */}
      <div className="flex items-center gap-1 px-1 pb-4 flex-shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all',
              tab === t.key
                ? 'text-white'
                : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.04]',
            )}
            style={tab === t.key ? {
              background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.15))',
              border: '1px solid rgba(99,102,241,0.3)',
            } : {}}
          >
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={exportMd}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-1.5 rounded-lg hover:bg-white/[0.04]">
          <Download size={11} /> Export
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {tab === 'summary' && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {session.synthesis_output
              ? <div className="markdown-body text-sm text-slate-300 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.synthesis_output}</ReactMarkdown>
                </div>
              : <div className="flex items-center gap-2 text-slate-600 text-sm py-6 justify-center">
                  <AlertTriangle size={16} /> No synthesis output yet.
                </div>}
          </div>
        )}

        {tab === 'agents' && (
          <div className="space-y-3">
            {session.agent_outputs && Object.keys(session.agent_outputs).length > 0
              ? Object.entries(session.agent_outputs).map(([role, output]) => (
                <AgentOutputAccordion key={role} role={role} output={output} />
              ))
              : <p className="text-slate-600 text-sm text-center py-6">No agent outputs.</p>}
          </div>
        )}

        {tab === 'log' && (
          <div className="space-y-1">
            {detail?.messages?.length
              ? detail.messages.map(m => <LogRow key={m.id} msg={m} />)
              : <p className="text-slate-600 text-sm text-center py-6">No messages.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentOutputAccordion({ role, output }: { role: string; output: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
          <Bot size={12} className="text-indigo-400" />
        </div>
        <span className="text-xs font-bold text-white uppercase tracking-wide">{role}</span>
        <span className="ml-auto text-slate-700">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 border-t border-white/[0.05]">
              <div className="markdown-body text-xs text-slate-300 leading-relaxed mt-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LogRow({ msg }: { msg: CollabMsg }) {
  const [open, setOpen] = useState(false)
  const COLORS: Record<string, string> = {
    ORCHESTRATOR: '#a78bfa', AGENT: '#818cf8', TOOL_CALL: '#fbbf24',
    TOOL_RESULT: '#34d399', SYNTHESIS: '#f472b6', SYSTEM: '#64748b',
  }
  const color = COLORS[msg.role] ?? '#64748b'
  const hasDetail = msg.content.length > 80 || !!msg.tool_input
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.04]" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className={clsx('flex items-center gap-2.5 px-3.5 py-2', hasDetail && 'cursor-pointer hover:bg-white/[0.03]')}
        onClick={() => hasDetail && setOpen(o => !o)}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color }}>{msg.role.replace('_', ' ')}</span>
        {msg.agent_name && <span className="text-[10px] text-slate-500">{msg.agent_name}</span>}
        {msg.tool_name && <span className="text-[10px] text-amber-500 flex items-center gap-1"><Wrench size={8} />{msg.tool_name}</span>}
        <span className="ml-auto text-slate-700 text-[10px]">#{msg.sequence}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <pre className="px-3.5 pb-3 text-[10px] font-mono text-slate-500 whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto border-t border-white/[0.04]">
              {msg.content || (msg.tool_input ? JSON.stringify(msg.tool_input, null, 2) : '')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── session form ───────────────────────────────────────────────────────────── */
function SessionForm({ initial, onDone, onCancel }: {
  initial?: Partial<CollabSession>; onDone: (s: CollabSession) => void; onCancel?: () => void
}) {
  const isEdit = !!initial?.id
  const [problem, setProblem] = useState(initial?.problem_statement ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [jiraKey, setJiraKey] = useState(initial?.jira_project_key ?? '')
  const [confKey, setConfKey] = useState(initial?.confluence_space_key ?? '')

  const mutation = useMutation({
    mutationFn: (d: object) => isEdit
      ? api.patch(`/collaborations/${initial!.id}`, d).then(r => r.data)
      : api.post('/collaborations', d).then(r => r.data),
    onSuccess: (s: CollabSession) => { toast.success(isEdit ? 'Updated' : 'Created'); onDone(s) },
    onError: () => toast.error('Failed'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault(); if (!problem.trim()) return
    mutation.mutate({
      problem_statement: problem.trim(),
      title: title.trim() || undefined,
      jira_project_key: jiraKey.trim() || undefined,
      confluence_space_key: confKey.trim() || undefined,
    })
  }

  const inp = 'w-full rounded-xl text-sm placeholder:text-slate-600 text-slate-200 focus:outline-none transition-all px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.07] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

  return (
    <form onSubmit={submit} className="space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" className={inp} />
      <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={5} required
        placeholder="Describe what you want to build or solve…"
        className={`${inp} resize-none`} />
      <div className="grid grid-cols-2 gap-2">
        <input value={jiraKey} onChange={e => setJiraKey(e.target.value)} placeholder="Jira key (opt.)" className={inp} />
        <input value={confKey} onChange={e => setConfKey(e.target.value)} placeholder="Confluence key (opt.)" className={inp} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={mutation.isPending || !problem.trim()}
          className="flex items-center gap-2 text-sm font-bold text-white rounded-xl px-4 py-2.5 disabled:opacity-50 transition-all"
          style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}>
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : isEdit ? <Check size={14} /> : <Zap size={14} />}
          {isEdit ? 'Save' : 'Create & Run'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="text-sm text-slate-600 hover:text-slate-300 px-3 py-2 rounded-xl transition-colors hover:bg-white/[0.04]">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

/* ─── session list item ──────────────────────────────────────────────────────── */
function SessionItem({
  session, selected, streaming, onSelect, onRun, onReset, onDelete, onEdit, globalStreaming,
}: {
  session: CollabSession; selected: boolean; streaming: boolean
  onSelect: () => void; onRun: () => void; onReset: () => void
  onDelete: () => void; onEdit: () => void; globalStreaming: boolean
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      onClick={onSelect}
      className={clsx(
        'relative group rounded-2xl p-3 cursor-pointer transition-all duration-200 border',
        selected ? 'border-indigo-500/30' : 'border-white/[0.05] hover:border-white/[0.09]',
      )}
      style={selected ? {
        background: 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.07))',
        boxShadow: '0 0 0 1px rgba(99,102,241,0.15)',
      } : {
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {selected && (
        <motion.div layoutId="sel-bar"
          className="absolute left-0 top-4 bottom-4 w-[2px] rounded-r-full"
          style={{ background: 'linear-gradient(to bottom,#6366f1,#8b5cf6)' }}
          transition={{ type: 'spring', bounce: 0.3 }}
        />
      )}

      <div className="pl-2">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-shrink-0 mt-0.5">
            {streaming ? <Loader2 size={12} className="text-indigo-400 animate-spin" />
              : session.status === 'COMPLETED' ? <CheckCircle size={12} className="text-emerald-400" />
              : session.status === 'FAILED' ? <XCircle size={12} className="text-red-400" />
              : <Clock size={12} className="text-slate-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={clsx('text-xs font-bold truncate', selected ? 'text-white' : 'text-slate-300')}>{session.title}</p>
            <p className="text-[10px] text-slate-600 truncate mt-0.5">{session.problem_statement.slice(0, 50)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-5">
          {(session.status === 'PENDING' || session.status === 'FAILED') && (
            <button onClick={e => { e.stopPropagation(); onRun() }} disabled={globalStreaming}
              className="flex items-center gap-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg px-2 py-1 transition-colors">
              <Play size={8} /> Run
            </button>
          )}
          {(session.status === 'COMPLETED' || session.status === 'FAILED') && (
            <button onClick={e => { e.stopPropagation(); onReset() }} disabled={globalStreaming}
              className="p-1 text-slate-600 hover:text-amber-400 rounded-lg transition-colors" title="Re-run">
              <RefreshCw size={10} />
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-1 text-slate-600 hover:text-slate-300 rounded-lg transition-colors">
            <Edit3 size={10} />
          </button>
          {session.status !== 'RUNNING' && (
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1 text-slate-600 hover:text-red-400 rounded-lg transition-colors ml-auto">
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════ MAIN ═══════════ */
export default function CollaboratePage() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuthStore()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [streamingId, setStreamingId] = useState<number | null>(null)
  const [liveEvents, setLiveEvents] = useState<SSEEvent[]>([])
  const [livePlan, setLivePlan] = useState<PlanItem[] | null>(null)
  const esRef = useRef<EventSource | null>(null)

  /* ── live agent-card state (derived from SSE events) ── */
  const agentCards = useMemo((): AgentCardData[] => {
    const map = new Map<string, AgentCardData>()
    for (const ev of liveEvents) {
      if (ev.type === 'orchestrator_done' && ev.plan) {
        for (const p of ev.plan) {
          const key = p.role_label ?? p.role_slug ?? p.persona_name ?? String(p.agent_id ?? '')
          if (!map.has(key)) {
            map.set(key, {
              key, label: p.role_label ?? p.persona_name ?? 'Agent',
              personaName: p.persona_name, task: p.task,
              status: 'queued', output: '', toolCalls: [],
            })
          }
        }
      }
      if (ev.type === 'agent_start') {
        const key = ev.role_label ?? ev.role_slug ?? ev.agent_name ?? ''
        if (key) {
          const existing = map.get(key) ?? {
            key, label: ev.role_label ?? ev.agent_name ?? key,
            personaName: ev.agent_name, department: ev.department, task: ev.task,
            status: 'queued' as const, output: '', toolCalls: [],
          }
          map.set(key, { ...existing, status: 'thinking', output: '', toolCalls: [] })
        }
      }
      if (ev.type === 'agent_chunk') {
        const key = ev.role_label ?? ev.role_slug ?? ev.agent_name ?? ''
        if (key && map.has(key)) {
          const c = map.get(key)!
          map.set(key, { ...c, output: c.output + (ev.content ?? '') })
        }
      }
      if (ev.type === 'agent_done') {
        const key = ev.role_label ?? ev.role_slug ?? ev.agent_name ?? ''
        if (key && map.has(key)) {
          const c = map.get(key)!
          map.set(key, { ...c, status: 'done', output: ev.output ?? c.output })
        }
      }
      if (ev.type === 'tool_call') {
        const key = ev.role_label ?? ev.role_slug ?? ev.agent_name ?? ''
        if (key && map.has(key)) {
          const c = map.get(key)!
          map.set(key, { ...c, toolCalls: [...c.toolCalls, { name: ev.tool_name ?? '', input: ev.tool_input, status: 'calling' }] })
        }
      }
      if (ev.type === 'tool_result') {
        const key = ev.role_label ?? ev.role_slug ?? ev.agent_name ?? ''
        if (key && map.has(key)) {
          const c = map.get(key)!
          // Match the last tool_call with this name and fill in the result
          const calls = [...c.toolCalls]
          const lastIdx = [...calls].reverse().findIndex(t => t.name === ev.tool_name && t.status === 'calling')
          if (lastIdx !== -1) {
            const realIdx = calls.length - 1 - lastIdx
            calls[realIdx] = { ...calls[realIdx], result: ev.result ?? '', status: ev.result?.includes('"error"') ? 'error' : 'done' }
          }
          map.set(key, { ...c, toolCalls: calls })
        }
      }
    }
    return Array.from(map.values())
  }, [liveEvents])

  const orchestratorText = useMemo(() => {
    let t = ''
    for (const ev of liveEvents) if (ev.type === 'orchestrator_chunk') t += ev.content ?? ''
    return t
  }, [liveEvents])

  const orchestratorDone = useMemo(() => liveEvents.some(e => e.type === 'orchestrator_done'), [liveEvents])
  const synthText = useMemo(() => {
    let t = ''
    for (const ev of liveEvents) if (ev.type === 'synthesis_chunk') t += ev.content ?? ''
    return t
  }, [liveEvents])

  /* ── queries / mutations ── */
  const { data: sessions = [], isLoading } = useQuery<CollabSession[]>({
    queryKey: ['collaborations'],
    queryFn: () => api.get('/collaborations').then(r => r.data),
    refetchInterval: streamingId ? false : 30_000,
  })

  const selectedSession = sessions.find(s => s.id === selectedId) ?? null

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/collaborations/${id}`),
    onSuccess: (_, id) => {
      toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['collaborations'] })
      if (selectedId === id) setSelectedId(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  const resetMutation = useMutation({
    mutationFn: (id: number) => api.post(`/collaborations/${id}/reset`).then(r => r.data),
    onSuccess: (session: CollabSession) => {
      toast.success('Reset'); queryClient.invalidateQueries({ queryKey: ['collaborations'] }); startRun(session.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  const stopRun = useCallback(async (id: number) => {
    try { await api.post(`/collaborations/${id}/cancel`) } catch { }
    esRef.current?.close(); esRef.current = null; setStreamingId(null)
    queryClient.invalidateQueries({ queryKey: ['collaborations'] })
    toast('Stopped', { icon: '⏹' })
  }, [queryClient])

  const startRun = useCallback(async (id: number) => {
    if (esRef.current) esRef.current.close()
    try { await api.get('/collaborations') } catch { }
    const token = getToken(); if (!token) { toast.error('Not authenticated'); return }
    setStreamingId(id); setSelectedId(id); setLiveEvents([]); setLivePlan(null)

    const es = new EventSource(`/api/collaborations/${id}/run?token=${encodeURIComponent(token)}`)
    esRef.current = es

    es.onmessage = e => {
      try {
        const ev: SSEEvent = JSON.parse(e.data)
        setLiveEvents(prev => [...prev, ev])
        if (ev.type === 'orchestrator_done' && ev.plan) setLivePlan(ev.plan)
        if (ev.type === 'session_done' || ev.type === 'error') {
          es.close(); esRef.current = null; setStreamingId(null)
          queryClient.invalidateQueries({ queryKey: ['collaborations'] })
          queryClient.invalidateQueries({ queryKey: ['collab-detail', id] })
          if (ev.type === 'error') {
            ev.code === 'already_running'
              ? toast.error('Already running — reset first', { duration: 5000 })
              : toast.error(`Failed: ${ev.message}`)
          } else {
            toast.success('Collaboration complete!')
          }
        }
      } catch { }
    }
    es.onerror = () => {
      const closed = (es as EventSource).readyState === EventSource.CLOSED
      es.close(); esRef.current = null; setStreamingId(null)
      queryClient.invalidateQueries({ queryKey: ['collaborations'] })
      if (!closed) toast.error('Stream disconnected')
    }
  }, [queryClient])

  useEffect(() => () => { esRef.current?.close() }, [])

  const isStreaming = streamingId !== null

  /* ── accent color palette for agent cards ── */
  const CARD_COLORS = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#3b82f6','#ef4444','#10b981']

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: 'calc(100vh - 3.5rem)', marginTop: '-1.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem' }}
    >

      {/* ═══ SESSION RAIL ════════════════════════════════════════════════════ */}
      <div
        className="w-[240px] flex-shrink-0 flex flex-col border-r"
        style={{
          background: 'rgba(16,12,26,0.85)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.05] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', boxShadow: '0 0 12px rgba(139,92,246,0.4)' }}>
              <Sparkles size={12} className="text-white" />
            </div>
            <span className="text-xs font-black text-white tracking-tight uppercase">Collaborate</span>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowNew(true); setEditingId(null) }}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 10px rgba(99,102,241,0.3)' }}>
            <Plus size={13} />
          </motion.button>
        </div>

        {/* new session form */}
        <AnimatePresence>
          {showNew && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/[0.05]"
            >
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Zap size={11} className="text-indigo-400" />
                  <p className="text-xs font-bold text-white">New Session</p>
                </div>
                <SessionForm
                  onDone={s => { setShowNew(false); queryClient.invalidateQueries({ queryKey: ['collaborations'] }); startRun(s.id) }}
                  onCancel={() => setShowNew(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* session list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {isLoading && <div className="flex justify-center pt-8"><Spinner size="sm" /></div>}
          {!isLoading && sessions.length === 0 && !showNew && (
            <div className="text-center pt-12 px-4">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Sparkles size={18} className="text-violet-500 opacity-50" />
              </div>
              <p className="text-xs text-slate-700">No sessions yet</p>
            </div>
          )}
          {sessions.map(s => (
            editingId === s.id ? (
              <div key={s.id} className="rounded-2xl border border-indigo-500/25 p-3" style={{ background: 'rgba(99,102,241,0.06)' }}>
                <p className="text-[10px] font-bold text-indigo-400 mb-2 uppercase tracking-wider">Edit</p>
                <SessionForm initial={s}
                  onDone={() => { setEditingId(null); queryClient.invalidateQueries({ queryKey: ['collaborations'] }) }}
                  onCancel={() => setEditingId(null)} />
              </div>
            ) : (
              <SessionItem key={s.id} session={s}
                selected={selectedId === s.id} streaming={streamingId === s.id}
                onSelect={() => { setSelectedId(s.id); setShowNew(false); setEditingId(null) }}
                onRun={() => startRun(s.id)}
                onReset={() => resetMutation.mutate(s.id)}
                onDelete={() => { if (confirm(`Delete "${s.title}"?`)) deleteMutation.mutate(s.id) }}
                onEdit={() => { setEditingId(s.id); setShowNew(false) }}
                globalStreaming={isStreaming}
              />
            )
          ))}
        </div>
      </div>

      {/* ═══ MAIN AREA ════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'transparent' }}>


        {/* ── no session ── */}
        {!selectedSession && !isStreaming && (
          <div className="flex-1 flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
              <div className="relative mx-auto w-24 h-24 mb-6">
                <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.35, 0.2] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute inset-0 rounded-3xl blur-2xl"
                  style={{ background: 'radial-gradient(circle,#8b5cf6,#6366f1)' }} />
                <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(99,102,241,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
                  <Network size={32} className="text-violet-400" />
                </div>
              </div>
              <h2 className="text-2xl font-black text-white mb-3" style={{ letterSpacing: '-0.04em' }}>Multi-Agent Collaboration</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Describe a problem. A team of AI agents will plan, divide the work, and synthesise a complete solution together.
              </p>
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-2xl px-6 py-3"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}>
                <Zap size={15} /> Launch a Session
              </motion.button>
            </motion.div>
          </div>
        )}

        {/* ── RUNNING: mission board ── */}
        {selectedSession && streamingId === selectedSession.id && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* run header */}
            <div className="flex items-center gap-3 px-6 py-3.5 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(15,17,32,0.8)', backdropFilter: 'blur(20px)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0"
                    style={{ boxShadow: '0 0 6px #818cf8', animation: 'ping 1.5s infinite' }} />
                  <p className="text-sm font-bold text-white truncate">{selectedSession.title}</p>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{selectedSession.problem_statement.slice(0, 80)}</p>
              </div>
              <button onClick={() => stopRun(selectedSession.id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-3 py-1.5 transition-all">
                <Square size={11} /> Stop
              </button>
            </div>

            {/* scrollable mission board */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* orchestrator banner */}
              {liveEvents.some(e => e.type === 'orchestrator_start') && (
                <OrchestratorBanner
                  text={orchestratorText}
                  planCount={agentCards.length}
                  done={orchestratorDone}
                />
              )}

              {/* agent card grid */}
              {agentCards.length > 0 && (
                <div className="grid gap-3 mb-5 grid-cols-1 lg:grid-cols-2">
                  {agentCards.map((agent, i) => (
                    <AgentCard
                      key={agent.key}
                      agent={agent}
                      accentColor={CARD_COLORS[i % CARD_COLORS.length]}
                    />
                  ))}
                </div>
              )}

              {/* synthesis streaming */}
              {synthText && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-5 mt-3"
                  style={{
                    background: 'linear-gradient(135deg,rgba(244,114,182,0.08),rgba(139,92,246,0.05))',
                    border: '1px solid rgba(244,114,182,0.2)',
                  }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,#ec4899,#8b5cf6)' }}>
                      <Sparkles size={11} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-pink-300 uppercase tracking-widest">Synthesis</span>
                  </div>
                  <div className="text-sm text-slate-400 font-mono leading-relaxed whitespace-pre-wrap">{synthText}
                    <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }}
                      className="inline-block w-1.5 h-3.5 bg-pink-400 ml-0.5 align-text-bottom rounded-sm" />
                  </div>
                </motion.div>
              )}

              {agentCards.length === 0 && !liveEvents.some(e => e.type === 'orchestrator_start') && (
                <div className="flex items-center gap-3 text-slate-600 text-sm py-8 justify-center">
                  <Loader2 size={14} className="animate-spin text-indigo-500" /> Connecting…
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPLETED / FAILED ── */}
        {selectedSession && streamingId !== selectedSession.id &&
         (selectedSession.status === 'COMPLETED' || selectedSession.status === 'FAILED') && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* header */}
            <div className="flex items-center gap-3 px-6 py-3.5 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(15,17,32,0.8)', backdropFilter: 'blur(20px)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{selectedSession.title}</p>
                <p className="text-xs text-slate-500 truncate">{selectedSession.problem_statement.slice(0, 80)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={clsx(
                  'flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full',
                  selectedSession.status === 'COMPLETED'
                    ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20'
                    : 'text-red-400 bg-red-500/10 border border-red-500/20',
                )}>
                  {selectedSession.status === 'COMPLETED' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                  {selectedSession.status}
                </span>
                <button onClick={() => resetMutation.mutate(selectedSession.id)} disabled={isStreaming}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-xl px-3 py-1.5 transition-all disabled:opacity-40">
                  <RefreshCw size={11} /> Re-run
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-6">
              <SynthesisView session={selectedSession} />
            </div>
          </div>
        )}

        {/* ── PENDING ── */}
        {selectedSession && streamingId !== selectedSession.id && selectedSession.status === 'PENDING' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-lg w-full">
              {/* problem statement card */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl p-6 mb-6"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Problem Statement</p>
                <p className="text-base text-slate-300 leading-relaxed">{selectedSession.problem_statement}</p>
              </motion.div>

              {/* launch button */}
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: '0 12px 40px rgba(99,102,241,0.45)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => startRun(selectedSession.id)}
                disabled={isStreaming}
                className="w-full flex items-center justify-center gap-3 text-base font-black text-white rounded-2xl py-4 disabled:opacity-50 transition-all"
                style={{
                  background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
                  letterSpacing: '-0.01em',
                }}
              >
                <Play size={18} /> Launch Multi-Agent Pipeline
              </motion.button>

              <p className="text-center text-xs text-slate-700 mt-3">AI agents will collaborate to solve your problem</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
