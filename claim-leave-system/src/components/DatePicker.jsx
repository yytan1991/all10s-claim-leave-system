import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { getMonthGrid, toISODate } from '../lib/helpers'

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// A small, styled calendar popover in place of the native <input type="date">.
// value / onChange work with plain "YYYY-MM-DD" strings, same as a native
// date input, so it drops in anywhere one was used.
export default function DatePicker({ value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const selected = value ? new Date(`${value}T00:00:00`) : null
  const [viewYear, setViewYear] = useState(selected ? selected.getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(selected ? selected.getMonth() : new Date().getMonth())

  const weeks = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const today = toISODate(new Date())

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openPicker() {
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
    setOpen(true)
  }

  function goToPrevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  function goToNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  function pickDay(date) {
    onChange(toISODate(date))
    setOpen(false)
  }

  const displayLabel = selected
    ? selected.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={openPicker}
        className="field-input flex items-center justify-between text-left"
      >
        <span className={displayLabel ? 'text-ink-900' : 'text-ink-500/60'}>
          {displayLabel || placeholder}
        </span>
        <Calendar size={15} className="text-ink-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-72 card p-3 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="rounded p-1 text-ink-500 hover:bg-sand-100 hover:text-ink-900"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-ink-900">{monthLabel}</p>
            <button
              type="button"
              onClick={goToNextMonth}
              className="rounded p-1 text-ink-500 hover:bg-sand-100 hover:text-ink-900"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-ink-500 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((date) => {
                  const iso = toISODate(date)
                  const inMonth = date.getMonth() === viewMonth
                  const isSelected = value === iso
                  const isToday = iso === today
                  return (
                    <button
                      type="button"
                      key={iso}
                      onClick={() => pickDay(date)}
                      className={`h-8 rounded-md text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-brand-600 text-white'
                          : isToday
                          ? 'bg-brand-50 text-brand-700'
                          : inMonth
                          ? 'text-ink-700 hover:bg-sand-100'
                          : 'text-ink-500/40 hover:bg-sand-100'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => pickDay(new Date())}
            className="mt-2 w-full text-center text-xs text-brand-600 hover:underline py-1"
          >
            Today
          </button>
        </div>
      )}
    </div>
  )
}
