import { useState } from 'react'
import { X } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import BottomNav from './BottomNav'

export default function AppLayout({ title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
        <div className="flex h-screen overflow-hidden bg-sand-50">
      <Sidebar className="hidden md:flex" />
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <div className="relative h-full">
              <button
                className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-white/70 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                <X size={18} />
              </button>
              <Sidebar />
            </div>
          </div>
        </div>
      )}

            <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar title={title} subtitle={subtitle} onMenuClick={() => setMobileOpen(true)} showMenuButton={false} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 pb-24 md:px-8 md:pb-6 min-w-0">{children}</main>
      </div>

      <BottomNav onMoreClick={() => setMobileOpen(true)} />
    </div>
  )
}

