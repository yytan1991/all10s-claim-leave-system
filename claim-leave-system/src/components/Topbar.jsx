import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Building2, ChevronDown, LogOut, Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/helpers'
import { getModules, flattenPages } from '../lib/navConfig'

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, onOutside])
}

// Type a page name and jump straight to it (only pages this person may open).
function QuickSearch({ pages }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const boxRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(boxRef, close)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return pages.filter((p) => `${p.label} ${p.moduleLabel}`.toLowerCase().includes(term)).slice(0, 8)
  }, [query, pages])

  useEffect(() => setCursor(0), [results])

  function go(page) {
    if (!page) return
    navigate(page.to)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[cursor])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search pages, e.g. invoices, leave, students…"
        aria-label="Search pages"
        className="w-full rounded-full bg-white/80 py-2.5 pl-10 pr-4 text-sm text-ink-900 shadow-card placeholder:text-ink-500/70 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white bg-white shadow-card">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">No page matches “{query.trim()}”.</p>
          ) : (
            results.map((p, i) => (
              <button
                key={p.to}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(p)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${i === cursor ? 'bg-brand-50' : ''}`}
              >
                <span className="font-medium text-ink-900">{p.label}</span>
                <span className="text-xs text-ink-500">{p.moduleLabel}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// What is waiting for a manager or admin. Looked up at most once a minute, because every page has its own top bar.
const noticeCache = { profileId: null, at: 0, items: [] }

function NotificationBell() {
  const { profile, isManager, isAdmin } = useAuth()
  const fresh = () => noticeCache.profileId === profile?.id && Date.now() - noticeCache.at < 60000
  const [items, setItems] = useState(fresh() ? noticeCache.items : [])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close)

  useEffect(() => {
    if (!profile || !isManager) return undefined
    if (fresh()) {
      setItems(noticeCache.items)
      return undefined
    }
    let cancelled = false
    async function count(table) {
      const { count: n } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('status', 'pending')
      return n || 0
    }
    Promise.all([count('leave_applications'), count('claims'), isAdmin ? count('registration_requests') : Promise.resolve(0)]).then(([leave, claims, regs]) => {
      const list = []
      if (leave) list.push({ key: 'leave', count: leave, text: `leave request${leave === 1 ? '' : 's'} waiting`, to: '/approvals' })
      if (claims) list.push({ key: 'claims', count: claims, text: `claim${claims === 1 ? '' : 's'} waiting`, to: '/approvals' })
      if (regs) list.push({ key: 'regs', count: regs, text: `new registration${regs === 1 ? '' : 's'} to review`, to: '/registration-approvals' })
      noticeCache.profileId = profile.id
      noticeCache.at = Date.now()
      noticeCache.items = list
      if (!cancelled) setItems(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isManager, isAdmin])

  const total = items.reduce((s, i) => s + i.count, 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={total ? `Notifications, ${total} waiting` : 'Notifications'}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-ink-700 shadow-card hover:bg-white"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-white bg-white shadow-card">
          <p className="border-b border-sand-100 px-4 py-3 text-sm font-semibold text-ink-900">Notifications</p>
          {items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-500">You're all caught up.</p>
          ) : (
            items.map((i) => (
              <Link key={i.key} to={i.to} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-sand-50">
                <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">{i.count}</span>
                <span className="text-ink-700">{i.text}</span>
              </Link>
            ))
          )}
          <Link to="/announcements" onClick={() => setOpen(false)} className="block border-t border-sand-100 px-4 py-3 text-sm font-medium text-brand-600 hover:bg-sand-50">
            View announcements
          </Link>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { profile, memberships, switchCompany, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-full bg-white/80 py-1.5 pl-1.5 pr-3 shadow-card hover:bg-white"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{initials(profile?.full_name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[9rem] truncate text-sm font-medium leading-tight text-ink-900">{profile?.full_name || 'Account'}</span>
          <span className="block text-[11px] capitalize leading-tight text-ink-500">{profile?.role}</span>
        </span>
        <ChevronDown size={15} className="text-ink-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-white bg-white shadow-card">
          <div className="border-b border-sand-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name}</p>
            <p className="truncate text-xs text-ink-500">{profile?.organizations?.name}</p>
          </div>
          {memberships.length > 1 && (
            <button type="button" onClick={switchCompany} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-ink-700 hover:bg-sand-50">
              <Building2 size={16} /> Switch company
            </button>
          )}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-ink-700 hover:bg-sand-50">
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function Topbar() {
  const { isManager, isAdmin } = useAuth()
  const pages = useMemo(() => flattenPages(getModules({ isManager, isAdmin })), [isManager, isAdmin])

  return (
    <header className="flex items-center gap-3 px-5 py-4 md:px-8">
      <p className="font-display text-lg font-semibold text-brand-700 md:hidden">WiiTeam</p>
      <div className="hidden max-w-xl flex-1 md:block">
        <QuickSearch pages={pages} />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
