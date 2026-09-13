import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarPlus,
  CalendarDays,
  ReceiptText,
  FileStack,
  ClipboardCheck,
  Users,
  Settings,
  Clock,
  CalendarRange,
  TrendingUp,
  Users2,
  KanbanSquare,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Each page mounts its own copy of the sidebar, so without this the nav
// scroll position would reset to the top on every navigation. This module-
// level variable survives across those remounts.
let savedScrollTop = 0

const staffLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/attendance', label: 'Attendance', icon: Clock },
  { to: '/leave/apply', label: 'Apply Leave', icon: CalendarPlus },
  { to: '/leave', label: 'My Leave', icon: CalendarDays },
  { to: '/team-calendar', label: 'Team Calendar', icon: CalendarRange },
  { to: '/claims/new', label: 'New Claim', icon: ReceiptText },
  { to: '/claims', label: 'My Claims', icon: FileStack },
]

const crmLinks = [
  { to: '/crm', label: 'Pipeline', icon: TrendingUp, end: true },
  { to: '/crm/board', label: 'Board', icon: KanbanSquare },
  { to: '/crm/leads', label: 'Leads', icon: Users2 },
]

const managerLinks = [
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/attendance-log', label: 'Attendance Log', icon: Clock },
]

const adminLinks = [
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ className = '' }) {
  const { profile, isManager, isAdmin } = useAuth()
  const navRef = useRef(null)

  useEffect(() => {
    if (navRef.current) navRef.current.scrollTop = savedScrollTop
  }, [])

  return (
    <aside className={`flex w-64 flex-col bg-ink-900 text-white shrink-0 h-full ${className}`}>
      <div className="px-5 py-6 border-b border-white/10">
        <p className="font-display text-lg font-semibold leading-tight">ALL 10S</p>
        <p className="text-xs text-white/50 tracking-wide">ERP</p>
      </div>

      <nav
        ref={navRef}
        onScroll={(e) => {
          savedScrollTop = e.currentTarget.scrollTop
        }}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
      >
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-white/40">Self-service</p>
        {staffLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}

        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-white/40">CRM</p>
        {crmLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}

        {isManager && (
          <>
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-white/40">Manager</p>
            {managerLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </>
        )}

        {isAdmin && (
          <>
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-white/40">Admin</p>
            {adminLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-white/40">Signed in as</p>
        <p className="text-sm font-medium truncate">{profile?.full_name || 'Loading…'}</p>
        <p className="text-xs text-brand-300 capitalize">{profile?.role}</p>
      </div>
    </aside>
  )
}
