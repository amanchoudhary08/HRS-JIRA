import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileText, Rocket } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import api from '../services/api'
import { Spinner, StatusBadge, EmptyState, PageHeader } from '../components/ui'
import type { SkillFile, Persona, SkillStatus } from '../types'

const TABS: Array<{ label: string; value: SkillStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Review', value: 'REVIEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Deployed', value: 'DEPLOYED' },
]

export default function SkillsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<SkillStatus | 'ALL'>('ALL')
  const [deploying, setDeploying] = useState<number | null>(null)

  const { data: skills, isLoading } = useQuery<SkillFile[]>({ queryKey: ['skills'], queryFn: () => api.get('/skills').then(r => r.data) })
  const { data: personas } = useQuery<Persona[]>({ queryKey: ['personas'], queryFn: () => api.get('/personas').then(r => r.data) })

  async function deploy(id: number) {
    setDeploying(id)
    try {
      await api.post(`/skills/${id}/deploy`)
      qc.invalidateQueries({ queryKey: ['skills'] })
      qc.invalidateQueries({ queryKey: ['personas'] })
      toast.success('Deployed')
    } catch { toast.error('Failed') } finally { setDeploying(null) }
  }

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  const all = skills ?? []
  const counts = all.reduce<Record<string, number>>((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a }, {})
  const filtered = tab === 'ALL' ? all : all.filter(s => s.status === tab)
  const getPersona = (pid: number) => (personas ?? []).find(p => p.id === pid)

  return (
    <div>
      <PageHeader title="Skill Files" description="AI-generated role specifications for every persona" />

      {/* status counts */}
      {Object.entries(counts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono"
              style={{ background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <StatusBadge status={status} size="sm" />
              <span className="font-bold text-slate-200">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-2)' }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${tab === t.value ? 'text-surface-0 bg-arc shadow-glow-sm' : 'text-slate-500 hover:text-slate-200'}`}>
            {t.label}
            {t.value !== 'ALL' && counts[t.value] ? <span className="ml-1 opacity-60">({counts[t.value]})</span> : null}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <EmptyState icon={FileText} title="No skill files" description="Generate a skill file from a persona to get started." />
        : (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Persona', 'Department', 'Status', 'Version', 'Updated', ''].map(h => (
                    <th key={h} className={`text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 px-4 py-3 ${!h && 'text-right'} ${h === 'Department' && 'hidden md:table-cell'} ${h === 'Version' && 'hidden sm:table-cell'} ${h === 'Updated' && 'hidden lg:table-cell'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(skill => {
                  const persona = getPersona(skill.persona_id)
                  return (
                    <tr key={skill.id} className="transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {persona && (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
                              style={{ background: `${persona.avatar_color}14`, color: persona.avatar_color }}>
                              {persona.avatar_initials}
                            </div>
                          )}
                          <span className="text-sm font-semibold text-slate-200">{persona?.name ?? `#${skill.persona_id}`}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">{persona?.department?.name ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={skill.status} /></td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs font-mono text-slate-500">v{skill.version}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs font-mono text-slate-600">
                        {skill.updated_at ? format(new Date(skill.updated_at), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {persona && (
                            <button onClick={() => navigate(`/personas/${persona.slug}`)}
                              className="text-xs text-arc hover:underline">View</button>
                          )}
                          {skill.status === 'APPROVED' && (
                            <button onClick={() => deploy(skill.id)} disabled={deploying === skill.id}
                              className="btn-arc text-[11px] py-1 px-2.5 disabled:opacity-60">
                              <Rocket size={10} />
                              {deploying === skill.id ? 'Deploying…' : 'Deploy'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
