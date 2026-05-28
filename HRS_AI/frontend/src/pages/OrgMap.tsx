import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Network, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '../services/api'
import { Spinner, Avatar, StatusBadge, EmptyState, PageHeader } from '../components/ui'
import type { Department, Persona } from '../types'

export default function OrgMapPage() {
  const navigate = useNavigate()
  const [sel, setSel] = useState<number | null>(null)

  const { data: departments, isLoading, error } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then(r => r.data) })
  const { data: personas } = useQuery<Persona[]>({ queryKey: ['personas'], queryFn: () => api.get('/personas').then(r => r.data) })

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  if (error || !departments) return <div className="text-center py-20 text-slate-500">Failed to load org data.</div>

  const filtered = sel ? departments.filter(d => d.id === sel) : departments

  function deptPersonas(deptId: number) {
    return (personas ?? []).filter(p => p.department_id === deptId)
  }

  return (
    <div>
      <PageHeader title="Org Map" description="Your organisation's agentic avatar structure" />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        <button onClick={() => setSel(null)}
          className={sel === null ? 'btn-arc text-xs py-1.5 px-3' : 'btn-ghost text-xs py-1.5 px-3'}>
          All
        </button>
        {departments.map(dept => (
          <button key={dept.id} onClick={() => setSel(dept.id === sel ? null : dept.id)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
            style={sel === dept.id
              ? { background: dept.color, color: '#000' }
              : { background: `${dept.color}10`, color: dept.color, border: `1px solid ${dept.color}25` }}>
            {dept.name}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <EmptyState icon={Network} title="No departments" description="No departments found." />
        : (
          <div className="space-y-6">
            {filtered.map(dept => {
              const dp = deptPersonas(dept.id)
              return (
                <motion.div key={dept.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  {/* dept header */}
                  <div className="rounded-lg p-4 mb-3 flex items-center gap-4"
                    style={{ background: `${dept.color}08`, border: `1px solid ${dept.color}15`, borderLeft: `3px solid ${dept.color}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100">{dept.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{dept.description}</p>
                    </div>
                    <div className="flex gap-4 text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                      <span>{dp.length} personas</span>
                      <span>{dept.agent_count ?? 0} agents</span>
                    </div>
                  </div>

                  {/* personas */}
                  {dp.length === 0
                    ? <p className="text-xs text-slate-600 pl-4">No personas in this department.</p>
                    : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pl-3">
                        {dp.map(persona => (
                          <button key={persona.id} onClick={() => navigate(`/personas/${persona.slug}`)}
                            className="flex flex-col items-start gap-2 p-3 rounded-lg text-left group transition-all duration-150 hover:scale-[1.02]"
                            style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Avatar initials={persona.avatar_initials} color={persona.avatar_color} size="sm" />
                            <div className="w-full min-w-0">
                              <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{persona.name}</p>
                              <div className="mt-1"><StatusBadge status={persona.skill_status ?? 'DRAFT'} size="sm" /></div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </motion.div>
              )
            })}
          </div>
        )}
    </div>
  )
}
