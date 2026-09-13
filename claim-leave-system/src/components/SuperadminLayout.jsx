import { NavLink } from 'react-router-dom'
import { LogOut, Building2, Users, Repeat } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { to: '/superadmin', label: 'Organizations', icon: Building2, end: true },
  { to: '/superadmin/users', label: 'Users', icon: Users },
]

export default function SuperadminLayout({ title, subtitle, children }) {
  const { profile, memberships, switchCompany, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="bg-ink-900 text-white">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-semibold leading-tight">ALL10S ERP</p>
            <p className="text-xs text-white/50">Superadmin</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 hidden sm:inline">{profile?.full_name}</span>
            {memberships.length > 1 && (
              <button onClick={switchCompany} className="btn-secondary text-sm">
                <Repeat size={15} />
                <span className="hidden sm:inline">Switch role/company</span>
              </button>
            )}
            <button onClick={signOut} className="btn-secondary text-sm">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-5 flex gap-1">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-400 text-white'
                    : 'border-transparent text-white/60 hover:text-white'
                }`
              }
            >
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
          {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  )
}
