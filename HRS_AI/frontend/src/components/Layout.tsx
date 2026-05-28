import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Network, Users, FileText, Bot, MessageSquare,
  FolderOpen, BarChart3, Settings, LogOut, Menu, X, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import hrsLogo from '../assets/hrslogo.png'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import api from '../services/api'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',   exact: true },
  { to: '/org',        icon: Network,         label: 'Org Map' },
  { to: '/personas',   icon: Users,           label: 'Personas' },
  { to: '/skills',     icon: FileText,        label: 'Skill Files' },
  { to: '/agents',     icon: Bot,             label: 'Agents',      badge: true },
  { to: '/chat',       icon: MessageSquare,   label: 'Chat' },
  { to: '/documents',  icon: FolderOpen,      label: 'Documents' },
  { to: '/analytics',  icon: BarChart3,       label: 'Analytics' },
  { to: '/collaborate',icon: Sparkles,        label: 'Collaborate' },
  { to: '/settings',   icon: Settings,        label: 'Settings' },
]

function NavItem({
  to, icon: Icon, label, exact, badge, pendingApprovals, expanded, onClick,
}: {
  to: string; icon: React.ElementType; label: string; exact?: boolean
  badge?: boolean; pendingApprovals: number; expanded: boolean; onClick: () => void
}) {
  return (
    <NavLink to={to} end={exact} onClick={onClick}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.97 }}
          className={clsx(
            'relative flex items-center gap-3 rounded-lg transition-all duration-150 cursor-pointer group',
            expanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center',
            isActive
              ? 'text-white'
              : 'text-slate-500 hover:text-slate-200'
          )}>
          {isActive && (
            <>
              <motion.div
                layoutId="nav-bg"
                className="absolute inset-0 rounded-lg"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
              <motion.div
                layoutId="nav-bar"
                className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full"
                style={{ background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,0.6)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            </>
          )}
          <motion.div
            className="relative z-10 flex-shrink-0"
            whileHover={{ rotate: 8, scale: 1.15 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <Icon size={16} />
          </motion.div>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.13 }}
                className="relative z-10 text-sm font-medium flex-1 truncate whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {badge && pendingApprovals > 0 && (
            <span className={clsx(
              'relative z-10 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center',
              expanded ? '' : 'absolute -top-0.5 -right-0.5',
              'bg-amber-400 text-black'
            )}>
              {pendingApprovals}
            </span>
          )}
        </motion.div>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const { sidebarExpanded, pendingApprovals, toggleSidebar } = useAppStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    api.post('/auth/logout').catch(() => {})
    logout()
    navigate('/login')
  }

  const initials = user?.name?.charAt(0)?.toUpperCase() ?? 'U'

  const sidebarContent = (expanded: boolean, onNav: () => void) => (
    <>
      {/* brand */}
      <div className="flex items-center h-14 flex-shrink-0 px-4"
        style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
        <img src={hrsLogo} alt="HRS" className="w-7 h-7 rounded-lg flex-shrink-0 object-contain" style={{ boxShadow: '0 0 12px rgba(34,211,238,0.25)' }} />
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.13 }} className="ml-3 min-w-0">
              <p className="text-sm font-black tracking-tight text-white">HRS.AI</p>
              <p className="text-[10px] font-mono" style={{ color: '#22d3ee', opacity: 0.7 }}>AGENTIC PLATFORM</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5"
        style={{ padding: expanded ? '12px 8px' : '12px 8px' }}>
        {NAV.map(n => (
          <NavItem key={n.to} {...n} pendingApprovals={pendingApprovals} expanded={expanded} onClick={onNav} />
        ))}
      </nav>

      {/* user */}
      <div className="flex-shrink-0 px-2 py-3"
        style={{ borderTop: '1px solid rgba(34,211,238,0.06)' }}>
        <div className={clsx('flex items-center gap-2.5', !expanded && 'justify-center flex-col')}>
          <motion.div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}
            whileHover={{ scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            {initials}
          </motion.div>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.13 }} className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-500 truncate font-mono capitalize">{user?.role?.replace(/_/g, ' ')}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            onClick={handleLogout}
            title="Logout"
            className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 flex-shrink-0"
            whileHover={{ scale: 1.1, rotate: -8 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <LogOut size={13} />
          </motion.button>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#08050f' }}>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarExpanded ? 200 : 56 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex flex-col flex-shrink-0 relative overflow-hidden"
        style={{ background: '#100c1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* subtle scan line */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(34,211,238,0.3) 0,rgba(34,211,238,0.3) 1px,transparent 1px,transparent 4px)' }} />
        {sidebarContent(sidebarExpanded, () => {})}

        {/* collapse toggle */}
        <button onClick={toggleSidebar}
          className="absolute -right-3 top-[4.2rem] w-6 h-6 rounded-full flex items-center justify-center z-20 transition-all hover:scale-110"
          style={{ background: '#0d1628', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
          <motion.svg animate={{ rotate: sidebarExpanded ? 0 : 180 }} transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </button>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -220 }} animate={{ x: 0 }} exit={{ x: -220 }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="absolute left-0 top-0 bottom-0 w-[200px] flex flex-col z-50"
              style={{ background: '#100c1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}
            >
              {sidebarContent(true, () => setMobileOpen(false))}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* mobile header */}
        <header className="md:hidden flex items-center justify-between h-12 px-4 flex-shrink-0"
          style={{ background: '#100c1a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <img src={hrsLogo} alt="HRS" className="w-5 h-5 rounded-md object-contain" />
            <span className="text-sm font-black text-white">HRS.AI</span>
          </div>
          <div className="w-8" />
        </header>

        {/* page */}
        <main className="flex-1 overflow-y-auto relative">
          {/* purple radial glow — matches reference screenshot */}
          <div className="pointer-events-none fixed inset-0 z-0"
            style={{
              background: [
                'radial-gradient(ellipse 90% 75% at 75% 30%, rgba(130,40,220,0.55) 0%, rgba(100,20,180,0.3) 35%, transparent 65%)',
                'radial-gradient(ellipse 50% 40% at 85% 10%, rgba(160,60,255,0.25) 0%, transparent 60%)',
                'radial-gradient(ellipse 60% 50% at 20% 80%, rgba(60,10,120,0.2) 0%, transparent 70%)',
              ].join(', '),
            }} />
          <div key={location.pathname} className="relative z-10 p-6 min-h-full page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
