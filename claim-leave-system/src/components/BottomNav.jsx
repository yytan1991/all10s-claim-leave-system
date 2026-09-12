import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Clock, CalendarDays, ReceiptText, Menu } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/attendance', label: 'Attendance', icon: Clock },
  { to: '/leave', label: 'Leave', icon: CalendarDays },
  { to: '/claims', label: 'Claims', icon: ReceiptText },
]

export default function BottomNav({ onMoreClick }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-sand-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium ${
                isActive ? 'text-brand-600' : 'text-ink-500'
              }`
            }
          >
            <Icon size={20} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-ink-500"
        >
          <Menu size={20} strokeWidth={2} />
          More
        </button>
      </div>
    </nav>
  )
}
