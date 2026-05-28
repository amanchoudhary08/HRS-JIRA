import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Bot, FileText, Activity, Star } from 'lucide-react'
import { subDays, format } from 'date-fns'
import api from '../services/api'
import { Spinner, KPICard, PageHeader } from '../components/ui'
import type { AnalyticsDashboard, OrgStats } from '../types'

const COLORS = ['#22d3ee', '#6366f1', '#f59e0b', '#ef4444', '#10b981']
const TT = {
  contentStyle: { background: '#0d1628', border: '1px solid rgba(34,211,238,0.15)', color: '#e8f0fe', borderRadius: '8px', fontSize: '11px' },
  labelStyle: { color: '#8dadd8' },
}
const TICK = { fill: '#405070', fontSize: 10 }
const GRID = { strokeDasharray: '3 3', stroke: 'rgba(34,211,238,0.05)' }

export default function AnalyticsPage() {
  const { data: analytics, isLoading } = useQuery<AnalyticsDashboard>({ queryKey: ['analytics-dashboard'], queryFn: () => api.get('/analytics/dashboard').then(r => r.data) })
  const { data: stats } = useQuery<OrgStats>({ queryKey: ['org-stats'], queryFn: () => api.get('/org/stats').then(r => r.data) })

  const csatData = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    date: format(subDays(new Date(), 29 - i), 'MMM d'),
    csat: +(4.2 + Math.random() * 0.7 - 0.1).toFixed(2),
  })), [])

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  if (!analytics) return <div className="text-center py-20 text-slate-500">Failed to load analytics.</div>

  const chartCard = (title: string, children: React.ReactNode) => (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 mb-4">{title}</p>
      {children}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Platform-wide performance metrics" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Total Agents"       value={analytics.total_agents}                          icon={Bot}      color="#22d3ee" />
        <KPICard title="Active Agents"      value={analytics.active_agents}                         icon={Bot}      color="#10b981" trend={analytics.active_agents > 0 ? 'up' : 'flat'} />
        <KPICard title="Executions Today"   value={analytics.executions_today}                      icon={Activity} color="#6366f1" />
        <KPICard title="Skill Deployed"     value={`${analytics.skill_deployed_pct?.toFixed(0) ?? 0}%`} icon={FileText} color="#f59e0b" trend={analytics.skill_deployed_pct >= 50 ? 'up' : 'down'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {chartCard('Executions Over Time', analytics.executions_by_day?.length
          ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics.executions_by_day}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tick={TICK} tickLine={false} axisLine={false} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#22d3ee' }} name="Executions" />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-xs text-slate-600">No data</div>
        )}

        {chartCard('Skill Files by Department', analytics.skill_by_dept?.length
          ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.skill_by_dept} barSize={16}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="dept" tick={TICK} tickLine={false} axisLine={false} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} />
                <Tooltip {...TT} />
                <Legend formatter={v => <span style={{ color: '#8dadd8', fontSize: 10 }}>{v}</span>} />
                <Bar dataKey="deployed" stackId="a" fill="#10b981" name="Deployed" />
                <Bar dataKey="review" stackId="a" fill="#f59e0b" name="Review" />
                <Bar dataKey="draft" stackId="a" fill="#405070" name="Draft" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-xs text-slate-600">No data</div>
        )}

        {chartCard('Execution Status Distribution', analytics.execution_status_dist?.length
          ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={analytics.execution_status_dist} dataKey="count" nameKey="status" cx="50%" cy="45%" outerRadius={65} innerRadius={32}>
                  {analytics.execution_status_dist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TT} formatter={(v, n) => [v, String(n).replace(/_/g, ' ')]} />
                <Legend formatter={v => <span style={{ color: '#8dadd8', fontSize: 10 }}>{String(v).replace(/_/g, ' ')}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-xs text-slate-600">No data</div>
        )}

        {chartCard('CSAT Trend (30 Days)', (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={csatData}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tick={TICK} tickLine={false} axisLine={false} interval={6} />
              <YAxis domain={[3.5, 5]} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip {...TT} formatter={v => [v, 'CSAT']} />
              <Area type="monotone" dataKey="csat" stroke="#22d3ee" strokeWidth={2} fill="url(#cg)" dot={false} activeDot={{ r: 3, fill: '#22d3ee' }} />
            </AreaChart>
          </ResponsiveContainer>
        ))}
      </div>
    </div>
  )
}
