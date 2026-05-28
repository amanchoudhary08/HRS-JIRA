import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, RotateCcw, Copy, Check, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import api from '../services/api'
import { Spinner } from '../components/ui'
import type { Persona, ChatMessage } from '../types'

/* ── copy hook ─────────────────────────────────────────────────────────────── */
function useCopy(text: string) {
  const [ok, setOk] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800) }
  return { ok, copy }
}

/* ── blinking cursor ───────────────────────────────────────────────────────── */
function Cursor() {
  return <span className="inline-block w-[7px] h-[14px] ml-0.5 align-text-bottom rounded-sm cursor" style={{ background: '#22d3ee' }} />
}

/* ── typing dots ───────────────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#22d3ee' }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 1, delay: i * 0.18, repeat: Infinity }} />
      ))}
    </div>
  )
}

/* ── persona selector pill ─────────────────────────────────────────────────── */
function PersonaPill({ persona, active, onClick }: { persona: Persona; active: boolean; onClick: () => void }) {
  return (
    <motion.button layout whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} onClick={onClick}
      className="relative flex items-center gap-2 rounded-lg transition-all duration-200 flex-shrink-0"
      style={active ? {
        background: `linear-gradient(135deg,${persona.avatar_color}14,${persona.avatar_color}08)`,
        border: `1px solid ${persona.avatar_color}35`,
        boxShadow: `0 0 16px -4px ${persona.avatar_color}25`,
        paddingRight: '12px', paddingLeft: '6px', paddingTop: '6px', paddingBottom: '6px',
      } : {
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '6px',
      }}>

      {/* avatar */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
        style={{
          background: `${persona.avatar_color}18`,
          color: persona.avatar_color,
          border: `1.5px solid ${active ? persona.avatar_color : persona.avatar_color + '35'}`,
          boxShadow: active ? `0 0 10px -2px ${persona.avatar_color}40` : undefined,
        }}>
        {persona.avatar_initials}
        {active && (
          <motion.span layoutId="active-pip"
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: '#22d3ee', border: '1.5px solid var(--surface-0)', boxShadow: '0 0 6px rgba(34,211,238,0.6)' }} />
        )}
      </div>

      {/* name — only when active */}
      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }} className="overflow-hidden whitespace-nowrap">
            <p className="text-xs font-bold leading-tight" style={{ color: persona.avatar_color }}>{persona.name}</p>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-3)' }}>{persona.department?.name}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/* ── message ───────────────────────────────────────────────────────────────── */
function Message({ msg, persona, isLast, streaming }: { msg: ChatMessage; persona?: Persona; isLast: boolean; streaming: boolean }) {
  const { ok, copy } = useCopy(msg.content)
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}
        className="flex justify-end">
        <div className="max-w-[70%] px-4 py-2.5 rounded-xl rounded-tr-sm text-sm text-slate-100 leading-relaxed"
          style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.18)' }}>
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className="flex gap-3 group">
      {/* avatar */}
      <div className="flex-shrink-0 pt-0.5">
        {persona ? (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
            style={{ background: `${persona.avatar_color}14`, color: persona.avatar_color, border: `1px solid ${persona.avatar_color}25` }}>
            {persona.avatar_initials}
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
            <Sparkles size={12} style={{ color: '#22d3ee' }} />
          </div>
        )}
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold" style={{ color: persona?.avatar_color ?? '#22d3ee' }}>
            {persona?.name ?? 'AI Assistant'}
          </span>
          {persona && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {persona.department?.name}
            </span>
          )}
        </div>

        <div className="relative rounded-xl rounded-tl-sm p-4 text-sm group"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderLeft: `2px solid ${persona?.avatar_color ?? '#22d3ee'}`,
          }}>
          <button onClick={copy}
            className="absolute top-3 right-3 p-1.5 rounded text-slate-700 hover:text-slate-300 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all">
            {ok ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>

          {msg.content ? (
            <div className="markdown-body text-sm pr-7">
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ inline, children }: any) => inline
                    ? <code className="font-mono text-arc bg-arc/10 border border-arc/15 px-1.5 py-0.5 rounded text-xs">{children}</code>
                    : <code>{children}</code>,
                  pre: ({ children }) => <pre className="font-mono text-slate-400 text-xs p-3 rounded-lg overflow-auto my-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,211,238,0.08)' }}>{children}</pre>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5">{children}</ol>,
                  strong: ({ children }) => <strong className="font-bold text-slate-100">{children}</strong>,
                  h2: ({ children }) => <h2 className="text-sm font-black text-white mt-4 mb-1.5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xs font-bold text-slate-200 mt-3 mb-1 uppercase tracking-wider">{children}</h3>,
                }}>
                {msg.content}
              </ReactMarkdown>
              {isLast && streaming && <Cursor />}
            </div>
          ) : isLast && streaming ? <TypingDots /> : null}
        </div>
      </div>
    </motion.div>
  )
}

/* ── suggestion chips ──────────────────────────────────────────────────────── */
function Suggestions({ persona, onPick }: { persona?: Persona; onPick: (s: string) => void }) {
  const chips = persona
    ? [`What are your core responsibilities?`, `Summarise ${persona.department?.name ?? 'team'} workflows`, `What decisions can you make autonomously?`]
    : ['How does the agent platform work?', 'What can AI personas do?', 'Help me get started']
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {chips.map(c => (
        <motion.button key={c} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={() => onPick(c)}
          className="text-xs px-3.5 py-2 rounded-lg transition-all"
          style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.12)', color: '#8dadd8' }}>
          {c}
        </motion.button>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════ MAIN ════════════════════════ */
export default function ChatPage() {
  const [selId, setSelId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const { data: personas = [], isLoading } = useQuery<Persona[]>({
    queryKey: ['personas'], queryFn: () => api.get('/personas').then(r => r.data),
  })
  const persona = personas.find(p => p.id === selId)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    const el = taRef.current; if (!el) return
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [input])

  const send = useCallback(async () => {
    if (!input.trim() || streaming) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput(''); setStreaming(true)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/actions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [...messages, userMsg], persona_id: selId }),
      })
      if (!res.ok || !res.body) throw new Error()
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6).trim(); if (d === '[DONE]') continue
          try {
            const p = JSON.parse(d); const chunk = p.text ?? p.content ?? p.delta ?? ''
            if (chunk) setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: 'assistant', content: n[n.length - 1].content + chunk }; return n })
          } catch {
            if (d) setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: 'assistant', content: n[n.length - 1].content + d }; return n })
          }
        }
      }
    } catch {
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }; return n })
    } finally { setStreaming(false) }
  }, [input, streaming, messages, selId])

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const accentColor = persona?.avatar_color ?? '#22d3ee'

  return (
    <div className="flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 3.5rem)', marginTop: '-1.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem' }}>

      {/* ══ PERSONA DOCK ═══════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0" style={{ background: 'var(--surface-1)', borderBottom: '1px solid rgba(34,211,238,0.07)' }}>
        <div className="flex items-center justify-between px-5 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#22d3ee,#6366f1)' }}>
              <Sparkles size={10} className="text-black" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.1em] text-white">Agent Chat</span>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-300 transition-colors">
              <RotateCcw size={10} /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-5 pb-3.5 overflow-x-auto hide-scrollbar">
          {/* general AI */}
          <motion.button layout whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} onClick={() => { setSelId(null); setMessages([]) }}
            className="flex items-center gap-2 rounded-lg flex-shrink-0 transition-all duration-200"
            style={selId === null ? {
              background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
              boxShadow: '0 0 14px -4px rgba(34,211,238,0.25)', paddingRight: '12px', paddingLeft: '6px', paddingTop: '6px', paddingBottom: '6px',
            } : { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', padding: '6px' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(34,211,238,0.12)', border: '1.5px solid rgba(34,211,238,0.3)', boxShadow: selId === null ? '0 0 10px -2px rgba(34,211,238,0.4)' : undefined }}>
              <Sparkles size={13} style={{ color: '#22d3ee' }} />
            </div>
            <AnimatePresence>
              {selId === null && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }} className="overflow-hidden whitespace-nowrap">
                  <p className="text-xs font-bold leading-tight" style={{ color: '#22d3ee' }}>General AI</p>
                  <p className="text-[10px] leading-tight" style={{ color: 'var(--text-3)' }}>No persona</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          <div className="w-px h-7 flex-shrink-0" style={{ background: 'rgba(34,211,238,0.08)' }} />

          {isLoading ? (
            <div className="flex items-center gap-2">{[1, 2, 3].map(i => <div key={i} className="w-10 h-10 rounded-lg skeleton" />)}</div>
          ) : (
            personas.map(p => (
              <PersonaPill key={p.id} persona={p} active={selId === p.id}
                onClick={() => { setSelId(p.id); setMessages([]) }} />
            ))
          )}
        </div>
      </div>

      {/* ══ CONVERSATION CANVAS ════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-5 py-5" style={{ background: 'var(--surface-0)' }}>
        {/* subtle dot grid */}
        <div className="pointer-events-none fixed inset-0 opacity-[0.018]"
          style={{ backgroundImage: 'radial-gradient(circle,rgba(34,211,238,0.6) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

        <div className="max-w-2xl mx-auto relative">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div key="empty"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center justify-center py-20 text-center gap-5">
                {/* hero */}
                <div className="relative">
                  {persona && (
                    <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 3, repeat: Infinity }}
                      className="absolute inset-0 rounded-2xl blur-2xl"
                      style={{ background: persona.avatar_color, transform: 'scale(1.7)' }} />
                  )}
                  <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
                    style={persona ? {
                      background: `${persona.avatar_color}15`, color: persona.avatar_color,
                      border: `1.5px solid ${persona.avatar_color}30`, boxShadow: `0 0 40px -8px ${persona.avatar_color}30`,
                    } : { background: 'rgba(34,211,238,0.08)', border: '1.5px solid rgba(34,211,238,0.2)' }}>
                    {persona ? persona.avatar_initials : <Sparkles size={28} style={{ color: '#22d3ee' }} />}
                  </div>
                </div>

                <div>
                  <h1 className="text-2xl font-black text-white mb-2 tracking-tight" style={{ letterSpacing: '-0.03em' }}>
                    {persona ? persona.name : 'What can I help with?'}
                  </h1>
                  <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    {persona
                      ? `${persona.description?.slice(0, 110) ?? `${persona.name} is ready.`}…`
                      : 'Select an agent above for domain expertise, or start a general conversation.'}
                  </p>
                </div>

                <Suggestions persona={persona} onPick={s => { setInput(s); taRef.current?.focus() }} />
              </motion.div>
            ) : (
              <motion.div key="msgs" className="space-y-5 pb-4">
                {messages.map((m, i) => (
                  <Message key={i} msg={m} persona={persona} isLast={i === messages.length - 1} streaming={streaming} />
                ))}
                <div ref={endRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══ COMMAND BAR ════════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 px-5 py-3.5"
        style={{ background: 'rgba(3,6,16,0.95)', borderTop: '1px solid rgba(34,211,238,0.06)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-2xl mx-auto">
          {persona && (
            <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full dot-live" />
              <span className="text-[11px] font-bold" style={{ color: accentColor + 'aa' }}>
                Talking to {persona.name}
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>· {persona.department?.name}</span>
            </motion.div>
          )}

          <div className="flex items-end gap-2 rounded-xl px-3.5 pt-3 pb-2.5 transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${input.trim() ? accentColor + '30' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: input.trim() ? `0 0 0 1px ${accentColor}12, 0 8px 24px rgba(0,0,0,0.5)` : undefined,
            }}>
            <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              rows={1} disabled={streaming}
              placeholder={`Message ${persona?.name ?? 'AI'}…`}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-700 focus:outline-none resize-none disabled:opacity-40 leading-relaxed"
              style={{ maxHeight: 140 }} />
            <div className="flex items-center gap-1.5 flex-shrink-0 mb-0.5">
              {streaming && <Spinner size="sm" />}
              <motion.button whileTap={{ scale: 0.85 }} onClick={send} disabled={!input.trim() || streaming}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:cursor-not-allowed"
                style={input.trim() && !streaming ? {
                  background: accentColor, boxShadow: `0 0 14px -2px ${accentColor}55`, color: '#000',
                } : { background: 'rgba(255,255,255,0.05)' }}>
                <Send size={13} className={input.trim() && !streaming ? 'text-black' : 'text-slate-600'} />
              </motion.button>
            </div>
          </div>
          <p className="text-[10px] font-mono text-center mt-1.5" style={{ color: 'var(--text-3)' }}>↵ Send · Shift+↵ New line</p>
        </div>
      </div>
    </div>
  )
}
