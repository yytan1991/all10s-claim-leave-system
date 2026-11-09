import { useState } from 'react'
import { X } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ModuleTabs from './ModuleTabs'
import BottomNav from './BottomNav'

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
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-24 md:px-8 md:pb-8">
          <ModuleTabs />
          <div className="mb-5">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>

      <BottomNav onMoreClick={() => setMobileOpen(true)} />
    </div>
  )
}
