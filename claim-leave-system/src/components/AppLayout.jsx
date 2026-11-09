import { useState } from 'react'
import { X } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ModuleTabs from './ModuleTabs'
import BottomNav from './BottomNav'
import { applyDensity } from '../lib/density'

// Apply the saved text size as soon as the app loads, so there is no flash of the larger size.
applyDensity()

export default function AppLayout({ title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      <Sidebar className="hidden md:flex" />

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            <div className="relative h-full">
              <button className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-ink-500 hover:text-ink-900" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
              <Sidebar width="w-72" variant="drawer" onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-24 md:px-6 md:pb-6">
          <ModuleTabs />
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>

      <BottomNav onMoreClick={() => setMobileOpen(true)} />
    </div>
  )
}
