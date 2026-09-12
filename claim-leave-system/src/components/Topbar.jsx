import { LogOut, Menu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/helpers'

export default function Topbar({ title, subtitle, onMenuClick, showMenuButton = true }) {
  const { profile, signOut } = useAuth()

  return (
    <header className="flex items-center justify-between border-b border-sand-200 bg-white px-5 py-4 md:px-8">
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="md:hidden rounded-md p-2 hover:bg-sand-100 text-ink-700"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
          {initials(profile?.full_name)}
        </div>
        <button onClick={signOut} className="btn-secondary" title="Log out">
          <LogOut size={16} />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  )
}
