import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Cpu, User } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { Spinner, PageHeader } from '../components/ui'
import { useAuthStore } from '../stores/auth'
import type { User as UserType } from '../types'

type Tab = 'org' | 'bedrock' | 'users'

const BEDROCK_INFO = [
  { key: 'AWS_PROFILE', value: import.meta.env.VITE_AWS_PROFILE ?? 'default' },
  { key: 'AWS_REGION', value: import.meta.env.VITE_AWS_REGION ?? 'us-east-1' },
  { key: 'BEDROCK_MODEL_ID', value: import.meta.env.VITE_BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
  { key: 'BEDROCK_INFERENCE_PROFILE', value: import.meta.env.VITE_BEDROCK_INFERENCE_PROFILE ?? 'us.anthropic.claude-3-5-sonnet-20241022-v2:0' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('org')
  const { user: currentUser } = useAuthStore()
  const [orgName, setOrgName] = useState('')
  const [orgDomain, setOrgDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [orgLoaded, setOrgLoaded] = useState(false)

  const { data: me } = useQuery<UserType>({ queryKey: ['me'], queryFn: () => api.get('/auth/me').then(r => r.data) })

  useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => {
      const r = await api.get('/org/overview')
      if (!orgLoaded) { setOrgName(r.data.organization?.name ?? ''); setOrgDomain(r.data.organization?.domain ?? ''); setOrgLoaded(true) }
      return r.data
    },
    enabled: tab === 'org',
  })

  async function saveOrg() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 400))
    toast.success('Saved (local only)')
    setSaving(false)
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'org', label: 'Org', icon: Building2 },
    { id: 'bedrock', label: 'Bedrock', icon: Cpu },
    { id: 'users', label: 'Account', icon: User },
  ]

  const sectionStyle = { background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.05)' }

  return (
    <div>
      <PageHeader title="Settings" description="Configure your HRS.AI platform" />

      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-2)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${tab === t.id ? 'text-surface-0 bg-arc shadow-glow-sm' : 'text-slate-500 hover:text-slate-200'}`}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'org' && (
        <div className="max-w-lg">
          <div className="rounded-xl p-5" style={sectionStyle}>
            <p className="text-sm font-bold text-slate-200 mb-4">Organisation Details</p>
            <div className="space-y-4">
              {[
                { label: 'Name', value: orgName, set: setOrgName, placeholder: 'HRS Group Corporation' },
                { label: 'Domain', value: orgDomain, set: setOrgDomain, placeholder: 'hrsgroup.com' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label} className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">{label}</label>
                  <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} className="field w-full" />
                </div>
              ))}
              <button onClick={saveOrg} disabled={saving} className="btn-arc text-xs disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'bedrock' && (
        <div className="max-w-lg">
          <div className="rounded-xl p-5" style={sectionStyle}>
            <p className="text-sm font-bold text-slate-200 mb-1">AWS Bedrock Configuration</p>
            <p className="text-xs text-slate-500 mb-4">Read-only. Configure in your backend .env file.</p>
            <div className="space-y-2">
              {BEDROCK_INFO.map(({ key, value }) => (
                <div key={key} className="rounded-lg p-3" style={{ background: 'var(--surface-0)', border: '1px solid rgba(34,211,238,0.07)' }}>
                  <p className="text-[10px] font-bold font-mono text-slate-500 mb-1">{key}</p>
                  <p className="text-xs font-mono text-slate-300 break-all">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <p className="text-xs" style={{ color: '#22d3ee', opacity: 0.8 }}>
                Update these values in your backend configuration and restart the server.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="max-w-lg space-y-3">
          <div className="rounded-xl p-5" style={sectionStyle}>
            <p className="text-sm font-bold text-slate-200 mb-4">Your Account</p>
            {me ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-0)', border: '1px solid rgba(34,211,238,0.07)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0"
                    style={{ background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}>
                    {me.name?.charAt(0) ?? 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200">{me.name}</p>
                    <p className="text-xs font-mono text-slate-500">{me.email}</p>
                  </div>
                </div>
                {[
                  { label: 'User ID', value: String(me.id) },
                  { label: 'Role', value: me.role.replace(/_/g, ' ') },
                  { label: 'Persona', value: me.persona_id ? `#${me.persona_id}` : 'Not assigned' },
                  { label: 'Member since', value: me.created_at ? new Date(me.created_at).toLocaleDateString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-mono text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
            ) : <div className="flex justify-center py-6"><Spinner /></div>}
          </div>

          <div className="rounded-xl p-5" style={sectionStyle}>
            <p className="text-sm font-bold text-slate-200 mb-3">Platform Info</p>
            {[
              { label: 'Version', value: '1.0.0' },
              { label: 'API Endpoint', value: 'http://localhost:8000' },
              { label: 'Environment', value: import.meta.env.MODE ?? 'development' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-mono text-slate-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
