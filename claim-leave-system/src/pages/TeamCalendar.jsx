import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { EmptyState } from '../components/UI'
import { getMonthGrid, toISODate } from '../lib/helpers'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TeamCalendar() {
  const { profile } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState(today.getMonth())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)

  const weeks = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex])
  const rangeStart = weeks[0][0]
  const rangeEnd = weeks[weeks.length - 1][6]

  useEffect(() => {
    if (profile) load()
    setSelectedDate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex, profile?.org_id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_team_leave', {
      range_start: toISODate(rangeStart),
      range_end: toISODate(rangeEnd),
      p_org_id: profile.org_id,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load team leave', error)
      setEntries([])
    } else {
      setEntries(data || [])
    }
    setLoading(false)
  }

  function entriesForDay(date) {
    const iso = toISODate(date)
    return entries.filter((e) => e.start_date <= iso && e.end_date >= iso)
  }

  function goToPrevMonth() {
    const d = new Date(year, monthIndex - 1, 1)
    setYear(d.getFullYear())
    setMonthIndex(d.getMonth())
  }
  function goToNextMonth() {
    const d = new Date(year, monthIndex + 1, 1)
    setYear(d.getFullYear())
    setMonthIndex(d.getMonth())
  }
  function goToToday() {
    setYear(today.getFullYear())
    setMonthIndex(today.getMonth())
  }

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })

  const selectedEntries = selectedDate ? entriesForDay(selectedDate) : []

  return (
    <AppLayout title="Team calendar" subtitle="See who's on leave across the team.">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="btn-secondary px-2.5">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-semibold font-display w-44 text-center">{monthLabel}</h2>
          <button onClick={goToNextMonth} className="btn-secondary px-2.5">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Approved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Pending
            </span>
          </div>
          <button onClick={goToToday} className="btn-secondary text-sm">
            Today
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-sand-100 text-ink-500 text-xs font-medium">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="px-3 py-2 text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="divide-y divide-sand-100">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-sand-100">
              {week.map((date) => {
                const inMonth = date.getMonth() === monthIndex
                const isToday = toISODate(date) === toISODate(today)
                const dayEntries = entriesForDay(date)
                const isSelected = selectedDate && toISODate(selectedDate) === toISODate(date)
                const visible = dayEntries.slice(0, 3)
                const overflow = dayEntries.length - visible.length

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`min-h-[92px] p-2 text-left align-top flex flex-col gap-1 transition-colors ${
                      inMonth ? 'bg-white' : 'bg-sand-50'
                    } ${isSelected ? 'ring-2 ring-inset ring-brand-500' : 'hover:bg-sand-50'}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white'
                          : inMonth
                          ? 'text-ink-700'
                          : 'text-ink-500/50'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <div className="space-y-1">
                      {visible.map((e) => (
                        <div
                          key={e.id + date.toISOString()}
                          className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            e.status === 'approved'
                              ? 'bg-brand-50 text-brand-700'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                          title={`${e.full_name} · ${e.leave_type}`}
                        >
                          {e.full_name.split(' ')[0]}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <p className="text-[11px] text-ink-500">+{overflow} more</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3">
          {selectedDate
            ? selectedDate.toLocaleDateString('en-MY', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : 'Select a day to see details'}
        </h3>

        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : !selectedDate ? (
          <p className="text-sm text-ink-500">Click any date above to see who's on leave that day.</p>
        ) : selectedEntries.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No one's on leave"
            description="Nobody has approved or pending leave for this day."
          />
        ) : (
          <div className="card divide-y divide-sand-100">
            {selectedEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{e.full_name}</p>
                  <p className="text-xs text-ink-500">
                    {e.leave_type} · {e.department || 'No department'}
                  </p>
                </div>
                <span
                  className={`badge ${
                    e.status === 'approved' ? 'badge-approved' : 'badge-pending'
                  }`}
                >
                  {e.status === 'approved' ? 'Approved' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
