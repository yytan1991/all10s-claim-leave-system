import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getModules, findActive } from '../lib/navConfig'

// A small friendly illustration for the bottom of the sidebar.
function PlantArt() {
  return (
    <svg viewBox="0 0 150 150" className="mt-2 h-auto w-28" aria-hidden="true">
      <path d="M75 104 C60 74 40 62 22 46 C50 40 72 58 75 104Z" fill="#9AD1A6" />
      <path d="M75 104 C92 68 112 58 131 44 C102 38 80 58 75 104Z" fill="#7FBF92" />
      <path d="M75 104 C68 72 70 46 82 18 C94 46 86 78 75 104Z" fill="#B9E2C3" />
      <path d="M54 108 h42 l-6 36 h-30z" fill="#F6B48A" />
      <rect x="50" y="101" width="50" height="10" rx="5" fill="#F29A66" />
    </svg>
  )
}

// One item per module. The pages inside a module show as tabs along the top of the page.
export default function Sidebar({ className = '', width = 'w-60', variant = 'static', onNavigate }) {
  const { isManager, isAdmin } = useAuth()
  const { pathname } = useLocation()
  const modules = getModules({ isManager, isAdmin })
  const activeKey = findActive(pathname, modules)?.module.key

  return (
    <aside
      className={`flex ${width} shrink-0 flex-col h-full ${
        variant === 'drawer' ? 'bg-white' : 'bg-white/60 backdrop-blur border-r border-white/70'
      } ${className}`}
    >
      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent font-display text-xl font-bold text-white shadow-pill">W</div>
        <div>
          <p className="font-display text-lg font-semibold leading-tight text-ink-900">WiiTeam</p>
          <p className="text-[11px] tracking-wide text-ink-500">ERP</p>
        </div>
      </div>

      <nav aria-label="Main menu" className="space-y-1.5 overflow-y-auto px-3 py-2">
        {modules.map(({ key, label, icon: Icon, to }) => (
          <Link key={key} to={to} onClick={onNavigate} aria-current={activeKey === key ? 'page' : undefined} className={activeKey === key ? 'nav-link-active' : 'nav-link'}>
            <Icon size={18} strokeWidth={2} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto hidden px-5 pb-6 [@media(min-height:820px)]:block">
        <p className="font-display text-sm leading-snug text-brand-700">
          Work smart,
          <br />
          grow together
        </p>
        <PlantArt />
      </div>
    </aside>
  )
}
