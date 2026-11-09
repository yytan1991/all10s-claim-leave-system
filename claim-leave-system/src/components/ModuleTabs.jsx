import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getModules, findActive } from '../lib/navConfig'

// The pages of the current module, as a row of tabs along the top of the page.
// Hidden for modules that have only one page (such as Home).
export default function ModuleTabs() {
  const { isManager, isAdmin } = useAuth()
  const { pathname } = useLocation()
  const active = findActive(pathname, getModules({ isManager, isAdmin }))
  if (!active || active.module.pages.length < 2) return null

  return (
    <nav aria-label={`${active.module.label} pages`} className="-mx-1 mb-5 overflow-x-auto px-1 pb-2">
      <div className="inline-flex gap-1 rounded-full bg-white/70 p-1.5 shadow-card">
        {active.module.pages.map((page) => (
          <Link key={page.to} to={page.to} aria-current={page.to === active.page.to ? 'page' : undefined} className={page.to === active.page.to ? 'tab-pill-active' : 'tab-pill'}>
            {page.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
