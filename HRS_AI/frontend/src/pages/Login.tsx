import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Zap, Shield, Users, ArrowRight } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { TokenResponse, User } from '../types'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Min 6 characters'),
})
type FormData = z.infer<typeof schema>

const FEATURES = [
  { icon: Zap, label: 'Role-based AI agents', sub: 'Every team member gets a purpose-built avatar' },
  { icon: Shield, label: 'Human-in-the-loop gates', sub: 'Approval checkpoints at every critical step' },
  { icon: Users, label: 'Persistent agent memory', sub: 'Context that survives across all sessions' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      const res = await api.post<TokenResponse>('/auth/login', { email: data.email, password: data.password })
      const { access_token, refresh_token } = res.data
      localStorage.setItem('access_token', access_token)
      const userRes = await api.get<User>('/auth/me', { headers: { Authorization: `Bearer ${access_token}` } })
      setAuth(userRes.data, access_token, refresh_token)
      navigate('/')
    } catch {
      toast.error('Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--surface-0)' }}>
      {/* grid bg */}
      <div className="fixed inset-0 pointer-events-none grid-bg opacity-40" />
      {/* corner glow */}
      <div className="fixed -top-40 -left-40 w-96 h-96 rounded-full blur-[100px] pointer-events-none"
        style={{ background: 'rgba(34,211,238,0.07)' }} />

      {/* left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 relative p-10"
        style={{ background: 'var(--surface-1)', borderRight: '1px solid rgba(34,211,238,0.08)' }}>

        {/* top brand */}
        <div>
          <div className="flex items-center gap-3 mb-14">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
              style={{ background: 'linear-gradient(135deg,#22d3ee,#6366f1)', color: '#000', boxShadow: '0 0 20px rgba(34,211,238,0.25)' }}>
              H
            </div>
            <div>
              <p className="text-sm font-black text-white tracking-wide">HRS.AI</p>
              <p className="text-[10px] font-mono" style={{ color: '#22d3ee', opacity: 0.6 }}>AGENTIC AVATAR PLATFORM</p>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="text-2xl font-black text-white mb-3 leading-tight tracking-tight">
              Enterprise AI agents for your <span className="text-gradient-arc">entire organisation</span>
            </h2>
            <p className="text-sm leading-relaxed mb-10" style={{ color: 'var(--text-2)' }}>
              Deploy role-specific avatars that understand your processes, tools, and responsibilities.
            </p>
          </motion.div>

          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, label, sub }, i) => (
              <motion.div key={label}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.15)' }}>
                  <Icon size={13} style={{ color: '#22d3ee' }} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{sub}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
          © {new Date().getFullYear()} HRS Group Corporation
        </p>
      </div>

      {/* right: form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
          className="w-full max-w-sm">

          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs"
              style={{ background: 'linear-gradient(135deg,#22d3ee,#6366f1)', color: '#000' }}>H</div>
            <span className="font-black text-white text-sm">HRS.AI</span>
          </div>

          <div className="mb-8">
            <h1 className="text-xl font-black text-white mb-1 tracking-tight">Sign in</h1>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>Access your agentic workspace</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">Email</label>
              <input {...register('email')} type="email" placeholder="you@hrsgroup.com" className="field w-full" />
              {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">Password</label>
              <input {...register('password')} type="password" placeholder="••••••••" className="field w-full" />
              {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
            </div>

            <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={isSubmitting}
              className="w-full btn-arc justify-center mt-2 py-2.5">
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-black/70 animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">Sign in <ArrowRight size={13} /></span>
              )}
            </motion.button>
          </form>

          <p className="text-sm text-center mt-6" style={{ color: 'var(--text-3)' }}>
            No account?{' '}
            <Link to="/signup" className="font-semibold transition-colors hover:text-white" style={{ color: '#22d3ee' }}>
              Create one
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
