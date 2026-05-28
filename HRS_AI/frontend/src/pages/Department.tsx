import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import api from '../services/api'
import { Spinner, Avatar, StatusBadge } from '../components/ui'
import type { Department, Persona } from '../types'

function TrendIcon({ value, target }: { value: number; target: number }) {
  if (value >= target) return <TrendingUp size={12} className="text-emerald-400" />
  if (value < target * 0.8) return <TrendingDown size={12} className="text-red-400" />
  return <Minus size={12} className="text-amber-400" />
}

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: dept, isLoading } = useQuery<Department>({
    queryKey: ['department', id],
    queryFn: () => api.get(`/departments/${id}`).then(r => r.data),
  })
  const { data: personas } = useQuery<Persona[]>({ queryKey: ['personas'], queryFn: () => api.get('/personas').then(r => r.data) })

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  if (!dept) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Department not found.</p>
      <button onClick={() => navigate(-1)} className="text-arc text-sm mt-2 hover:underline">Go back</button>
    </div>
  )

  const dp = (personas ?? []).filter(p => p.department_id === dept.id)

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs mb-4 transition-colors">
        <ArrowLeft size={13} /> Back
      </button>

      {/* header */}
      <div className="rounded-xl p-5 mb-5"
        style={{ background: `${dept.color}08`, border: `1px solid ${dept.color}18`, borderLeft: `3px solid ${dept.color}` }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-white">{dept.name}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>{dept.description}</p>
          </div>
          <div className="flex gap-3 text-center flex-shrink-0">
            <div className="rounded-lg px-4 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-lg font-black text-white">{dp.length}</p>
              <p className="text-[10px] font-mono text-slate-500">Personas</p>
            </div>
            <div className="rounded-lg px-4 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-lg font-black text-white">{dept.agent_count ?? 0}</p>
              <p className="text-[10px] font-mono text-slate-500">Agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {dept.kpis && dept.kpis.length > 0 && (
        <div className="mb-5">
          <p className="section-title">KPIs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {dept.kpis.map(kpi => (
              <div key={kpi.id} className="rounded-lg p-4"
                style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500 truncate">{kpi.name}</p>
                  <TrendIcon value={kpi.value} target={kpi.target} />
                </div>
                <p className="text-xl font-black text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {kpi.value}<span className="text-xs font-normal text-slate-500 ml-1">{kpi.unit}</span>
                </p>
                <p className="text-[10px] font-mono text-slate-600 mt-1">Target: {kpi.target} {kpi.unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personas */}
      <div>
        <p className="section-title">Personas ({dp.length})</p>
        {dp.length === 0
          ? <p className="text-sm text-slate-600">No personas yet.</p>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {dp.map(persona => (
                <button key={persona.id} onClick={() => navigate(`/personas/${persona.slug}`)}
                  className="flex items-center gap-3 p-4 rounded-xl text-left group transition-all duration-150 hover:scale-[1.01]"
                  style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Avatar initials={persona.avatar_initials} color={persona.avatar_color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors truncate">{persona.name}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{persona.description?.slice(0, 50)}…</p>
                    <div className="mt-1"><StatusBadge status={persona.skill_status ?? 'DRAFT'} size="sm" /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
