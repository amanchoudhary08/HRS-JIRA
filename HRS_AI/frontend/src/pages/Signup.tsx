import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowRight } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { TokenResponse, User } from '../types'

const schema = z.object({
  name: z.string().min(2, 'Min 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Min 6 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      const res = await api.post<TokenResponse>('/auth/register', { name: data.name, email: data.email, password: data.password })
      const { access_token, refresh_token } = res.data
      localStorage.setItem('access_token', access_token)
      const userRes = await api.get<User>('/auth/me', { headers: { Authorization: `Bearer ${access_token}` } })
      setAuth(userRes.data, access_token, refresh_token)
      toast.success('Account created!')
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.detail
      toast.error(msg ?? 'Registration failed')
    }
  }

  const field = (key: keyof FormData, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 block">{label}</label>
      <input {...register(key)} type={type} placeholder={placeholder} className="field w-full" />
      {errors[key] && <p className="text-red-400 text-xs">{errors[key]?.message as string}</p>}
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-0)' }}>
      <div className="fixed inset-0 pointer-events-none grid-bg opacity-30" />
      <div className="fixed -bottom-40 -right-40 w-96 h-96 rounded-full blur-[100px] pointer-events-none"
        style={{ background: 'rgba(99,102,241,0.07)' }} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
        className="w-full max-w-sm">

        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs"
            style={{ background: 'linear-gradient(135deg,#22d3ee,#6366f1)', color: '#000' }}>H</div>
          <div>
            <p className="text-sm font-black text-white">HRS.AI</p>
            <p className="text-[10px] font-mono" style={{ color: '#22d3ee', opacity: 0.6 }}>AGENTIC PLATFORM</p>
          </div>
        </div>

        <div className="mb-7">
          <h1 className="text-xl font-black text-white tracking-tight">Create account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Join your organisation's agentic workspace</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {field('name', 'Full name', 'text', 'Jane Smith')}
          {field('email', 'Email', 'email', 'you@hrsgroup.com')}
          {field('password', 'Password', 'password', '••••••••')}
          {field('confirmPassword', 'Confirm password', 'password', '••••••••')}

          <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={isSubmitting}
            className="w-full btn-arc justify-center mt-2 py-2.5">
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-black/70 animate-spin" />
                Creating…
              </span>
            ) : (
              <span className="flex items-center gap-2">Create account <ArrowRight size={13} /></span>
            )}
          </motion.button>
        </form>

        <p className="text-sm text-center mt-5" style={{ color: 'var(--text-3)' }}>
          Have an account?{' '}
          <Link to="/login" className="font-semibold hover:text-white transition-colors" style={{ color: '#22d3ee' }}>
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
