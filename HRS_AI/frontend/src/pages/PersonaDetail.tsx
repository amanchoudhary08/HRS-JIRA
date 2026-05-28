import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Database, GitBranch, Wand2, Play, Save, Send, ShieldCheck, Rocket } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { Spinner, Avatar, StatusBadge, Modal } from '../components/ui'
import type { Persona, SkillFile, Agent } from '../types'

export default function PersonaDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState<string | null>(null)
  const [runModal, setRunModal] = useState(false)
  const [taskName, setTaskName] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [running, setRunning] = useState(false)

  const { data: persona, isLoading } = useQuery<Persona>({ queryKey: ['persona', slug], queryFn: () => api.get(`/personas/${slug}`).then(r => r.data) })
  const { data: skillFile, isLoading: ls } = useQuery<SkillFile | null>({
    queryKey: ['skill-file', persona?.id],
    queryFn: async () => {
      if (!persona?.id) return null
      try { return (await api.get(`/skills/${persona.id}`)).data } catch { return null }
    },
    enabled: !!persona?.id,
  })
  const { data: agent } = useQuery<Agent | null>({
    queryKey: ['agent-for-persona', persona?.id],
    queryFn: async () => {
      if (!persona?.id) return null
      const agents: Agent[] = (await api.get('/agents')).data
      return agents.find(a => a.persona_id === persona.id) ?? null
    },
    enabled: !!persona?.id,
  })

  async function saveSkill() {
    if (!skillFile) return; setSaving(true)
    try { await api.put(`/skills/${skillFile.id}`, { content: editContent }); qc.invalidateQueries({ queryKey: ['skill-file', persona?.id] }); toast.success('Saved'); setEditMode(false) }
    catch { toast.error('Failed') } finally { setSaving(false) }
  }
  async function transition(action: string) {
    if (!skillFile) return; setTransitioning(action)
    try {
      await api.post(`/skills/${skillFile.id}/${action}`)
      qc.invalidateQueries({ queryKey: ['skill-file', persona?.id] })
      qc.invalidateQueries({ queryKey: ['persona', slug] })
      qc.invalidateQueries({ queryKey: ['personas'] })
      toast.success(`${action} complete`)
    } catch { toast.error(`Failed: ${action}`) } finally { setTransitioning(null) }
  }
  async function runTask() {
    if (!agent || !taskName.trim()) return; setRunning(true)
    try { await api.post(`/agents/${agent.id}/execute`, { task_name: taskName, input: { description: taskDesc } }); toast.success('Task submitted'); setRunModal(false); navigate('/agents') }
    catch { toast.error('Failed') } finally { setRunning(false) }
  }

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  if (!persona) return <div className="text-center py-20 text-slate-500">Persona not found.</div>

  const dept = persona.department

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs mb-4 transition-colors">
        <ArrowLeft size={13} /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* left */}
        <div className="lg:col-span-2 space-y-3">
          {/* identity */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-start gap-4 mb-4">
              <Avatar initials={persona.avatar_initials} color={persona.avatar_color} size="lg" />
              <div>
                <h1 className="text-base font-black text-white">{persona.name}</h1>
                {dept && (
                  <span className="inline-block text-xs font-bold px-2 py-0.5 rounded mt-1"
                    style={{ background: `${dept.color}15`, color: dept.color }}>
                    {dept.name}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{persona.description}</p>
          </div>

          {persona.responsibilities?.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="section-title flex items-center gap-1.5"><CheckCircle size={10} className="text-emerald-400" />Responsibilities</p>
              <ul className="space-y-1.5">
                {persona.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span style={{ color: '#22d3ee' }}>·</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {persona.data_access?.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="section-title flex items-center gap-1.5"><Database size={10} style={{ color: '#22d3ee' }} />Data Access</p>
              <div className="flex flex-wrap gap-1.5">
                {persona.data_access.map((d, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(34,211,238,0.07)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.15)' }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          {persona.processes?.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="section-title flex items-center gap-1.5"><GitBranch size={10} className="text-amber-400" />Processes</p>
              <ul className="space-y-1.5">
                {persona.processes.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-amber-400">→</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* right */}
        <div className="lg:col-span-3 space-y-3">
          {/* skill file */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-200">Skill File</p>
              {skillFile && (
                <div className="flex items-center gap-2">
                  <StatusBadge status={skillFile.status} />
                  <span className="text-xs font-mono text-slate-600">v{skillFile.version}</span>
                </div>
              )}
            </div>

            {ls ? <div className="flex justify-center py-8"><Spinner /></div>
              : !skillFile ? (
                <div className="text-center py-8 rounded-xl" style={{ border: '1px dashed rgba(34,211,238,0.15)' }}>
                  <Wand2 size={20} className="mx-auto mb-3" style={{ color: 'rgba(34,211,238,0.4)' }} />
                  <p className="text-sm text-slate-500 mb-4">No skill file yet.</p>
                  <button onClick={() => navigate(`/skills/generate/${persona.id}`)}
                    className="btn-arc text-xs">
                    <Wand2 size={12} /> Generate with AI
                  </button>
                </div>
              ) : (
                <div>
                  <textarea
                    value={editMode ? editContent : (skillFile.content ?? '')}
                    onChange={e => setEditContent(e.target.value)}
                    readOnly={!editMode}
                    className="w-full h-72 text-xs font-mono text-slate-300 rounded-lg p-3 resize-none focus:outline-none transition-all"
                    style={{ background: 'var(--surface-0)', border: '1px solid rgba(34,211,238,0.1)', ...(editMode && { borderColor: 'rgba(34,211,238,0.3)' }) }}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {!editMode ? (
                      <button onClick={() => { setEditContent(skillFile.content ?? ''); setEditMode(true) }} className="btn-dim text-xs">Edit</button>
                    ) : (
                      <>
                        <button onClick={saveSkill} disabled={saving} className="btn-arc text-xs disabled:opacity-50">
                          <Save size={11} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditMode(false)} className="btn-ghost text-xs">Cancel</button>
                      </>
                    )}
                    {skillFile.status === 'DRAFT' && (
                      <button onClick={() => transition('review')} disabled={transitioning === 'review'}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                        style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <Send size={11} /> {transitioning === 'review' ? 'Submitting…' : 'Submit for Review'}
                      </button>
                    )}
                    {skillFile.status === 'REVIEW' && (
                      <button onClick={() => transition('approve')} disabled={transitioning === 'approve'}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                        style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <ShieldCheck size={11} /> {transitioning === 'approve' ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    {skillFile.status === 'APPROVED' && (
                      <button onClick={() => transition('deploy')} disabled={transitioning === 'deploy'}
                        className="btn-arc text-xs disabled:opacity-50">
                        <Rocket size={11} /> {transitioning === 'deploy' ? 'Deploying…' : 'Deploy'}
                      </button>
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* agent */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-sm font-bold text-slate-200 mb-4">Agent</p>
            {agent ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{agent.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={agent.status} size="sm" />
                    {agent.last_active && <span className="text-[10px] font-mono text-slate-600">Last active {new Date(agent.last_active).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button onClick={() => setRunModal(true)} className="btn-arc text-xs"><Play size={11} /> Run Task</button>
              </div>
            ) : <p className="text-xs text-slate-600">No agent assigned to this persona.</p>}
          </div>
        </div>
      </div>

      <Modal open={runModal} onClose={() => setRunModal(false)} title="Run Agent Task">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">Task Name</label>
            <input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="e.g. Analyse Q2 metrics" className="field w-full" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">Description</label>
            <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} rows={4} placeholder="What should the agent do?" className="field w-full resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRunModal(false)} className="btn-ghost text-sm">Cancel</button>
            <button onClick={runTask} disabled={running || !taskName.trim()} className="btn-arc text-sm disabled:opacity-50">
              <Play size={13} /> {running ? 'Starting…' : 'Run Task'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
