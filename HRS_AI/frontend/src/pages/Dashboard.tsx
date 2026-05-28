import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { Bot, FileText, Activity, Plus, Play, MessageSquare, ArrowRight } from 'lucide-react'
import api from '../services/api'
import { Spinner, KPICard, PageHeader } from '../components/ui'
import type { OrgStats, AnalyticsDashboard, Department } from '../types'

const COLORS = ['#22d3ee', '#6366f1', '#f59e0b', '#ef4444', '#10b981']

const TT = {
  contentStyle: { background: 'rgba(8,5,15,0.95)', border: '1px solid rgba(34,211,238,0.2)', color: '#f0f0ff', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#a09ab8' },
  itemStyle: { color: '#f0f0ff' },
  cursor: { fill: 'rgba(34,211,238,0.05)' },
}

export default function DashboardPage() {
  const { data: stats, isLoading: ls } = useQuery<OrgStats>({
    queryKey: ['org-stats'],
    queryFn: () => api.get('/org/stats').then(r => r.data),
    refetchInterval: 15_000,
  })
  const { data: analytics, isLoading: la } = useQuery<AnalyticsDashboard>({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    refetchInterval: 15_000,
  })
  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
    refetchInterval: 30_000,
  })

  // Normalise skill_by_dept: backend returns "department" key, type expects "dept"
  const skillByDept = analytics?.skill_by_dept?.map((d: any) => ({
    dept: d.dept ?? d.department ?? '',
    deployed: d.deployed ?? 0,
    review: d.review ?? 0,
    draft: d.draft ?? 0,
  })) ?? []

  // Format execution dates for display
  const execByDay = analytics?.executions_by_day?.map(d => ({
    ...d,
    date: (() => { try { return format(parseISO(d.date), 'MMM d') } catch { return d.date } })(),
  })) ?? []

  if (ls || la) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        description="Real-time overview of your agentic platform"
        action={
          <Link to="/agents" className="btn-arc text-xs">
            <Play size={12} /> Run Agent
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Active Agents"        value={stats?.active_agents ?? 0}              icon={Bot}      color="#22d3ee" trend={stats && stats.active_agents > 0 ? 'up' : 'flat'} />
        <KPICard title="Skills Deployed"      value={stats?.skill_files_deployed ?? 0}       icon={FileText} color="#6366f1" trend="up" />
        <KPICard title="Executions Today"     value={stats?.executions_today ?? 0}           icon={Activity} color="#10b981" trend="flat" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 mb-4">Executions — Last 14 Days</p>
          {execByDay.length ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={execByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#405070', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#405070', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#22d3ee' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm text-slate-600">No data yet</div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 mb-4">Execution Status</p>
          {analytics?.execution_status_dist?.length ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={analytics.execution_status_dist} dataKey="count" nameKey="status" cx="50%" cy="45%" outerRadius={60} innerRadius={28}>
                  {analytics.execution_status_dist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TT} formatter={(v, n) => [v, String(n).replace(/_/g, ' ')]} />
                <Legend formatter={v => <span style={{ color: '#8dadd8', fontSize: 10 }}>{String(v).replace(/_/g, ' ')}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm text-slate-600">No data yet</div>
          )}
        </div>
      </div>

      {/* Departments */}
      {departments && departments.length > 0 && (
        <div>
          <p className="section-title mb-3">Departments</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {departments.map(dept => (
              <Link key={dept.id} to={`/departments/${dept.id}`}
                className="rounded-lg p-3.5 transition-all duration-150 hover:scale-[1.01] group"
                style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)', borderLeft: `3px solid ${dept.color}` }}>
                <p className="text-xs font-bold text-slate-200 truncate group-hover:text-white transition-colors">{dept.name}</p>
                <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-3)' }}>
                  {dept.persona_count ?? 0} personas · {dept.agent_count ?? 0} agents
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="section-title mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { to: '/skills', icon: Plus, label: 'Generate Skill File', color: '#6366f1' },
            { to: '/agents', icon: Play, label: 'Run Agent Task', color: '#22d3ee' },
            { to: '/chat', icon: MessageSquare, label: 'Chat with Persona', color: '#10b981' },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={to} to={to}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-all duration-150 px-3.5 py-2 rounded-lg group"
              style={{ background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Icon size={12} style={{ color }} />
              {label}
              <ArrowRight size={10} className="opacity-0 group-hover:opacity-60 -ml-0.5 transition-opacity" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
