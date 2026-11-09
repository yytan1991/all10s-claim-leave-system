import { useState } from 'react'
import { X, Download } from 'lucide-react'
import DatePicker from './DatePicker'
import { Alert } from './UI'
import { toISODate } from '../lib/helpers'
import { exportAttendance } from '../lib/lessonAttendanceExport'

// Admin only: download one lesson's attendance (or every lesson's) as an Excel file for a date range.
export default function ExportAttendanceModal({ lessons, defaultLessonId, orgId, onClose }) {
  const now = new Date()
  const today = toISODate(now)
  const [lessonId, setLessonId] = useState(defaultLessonId && lessons.some((l) => l.id === defaultLessonId) ? defaultLessonId : lessons[0]?.id || 'all')
  const [from, setFrom] = useState(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function preset(kind) {
    setError('')
    setMessage('')
    if (kind === 'this-month') {
      setFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(today)
    } else if (kind === 'last-month') {
      setFrom(toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
      setTo(toISODate(new Date(now.getFullYear(), now.getMonth(), 0)))
    } else if (kind === 'this-year') {
      setFrom(toISODate(new Date(now.getFullYear(), 0, 1)))
      setTo(today)
    }
  }

  async function handleExport() {
    setError('')
    setMessage('')
    if (!from || !to) {
      setError('Choose a start and an end date.')
      return
    }
    if (from > to) {
      setError('The start date must be on or before the end date.')
      return
    }
    if ((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000 > 366) {
      setError('Choose a period of one year or less.')
      return
    }
    setBusy(true)
    try {
      const result = await exportAttendance({ lessons, lessonId, from, to, orgId })
      if (result.empty) {
        setMessage('No attendance was marked in that period, so there is nothing to export.')
      } else {
        setMessage(`Downloaded ${result.filename} (${result.markCount} attendance mark${result.markCount === 1 ? '' : 's'}).`)
      }
    } catch (e) {
      setError(e.message || 'The export failed. Please try again.')
    }
    setBusy(false)
  }

  const presetClass = 'rounded-full border border-sand-200 px-3 py-1 text-xs text-ink-700 hover:bg-sand-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="card w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Export attendance to Excel</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}
          {message && <Alert tone="brand">{message}</Alert>}

          <div>
            <label className="field-label">Lesson</label>
            <select className="field-input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="all">All lessons (one tab each)</option>
            </select>
          </div>

          <div>
            <label className="field-label">Period</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button type="button" className={presetClass} onClick={() => preset('this-month')}>
                This month
              </button>
              <button type="button" className={presetClass} onClick={() => preset('last-month')}>
                Last month
              </button>
              <button type="button" className={presetClass} onClick={() => preset('this-year')}>
                This year
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-ink-500 mb-1">From</p>
                <DatePicker value={from} onChange={setFrom} maxDate={today} />
              </div>
              <div>
                <p className="text-[11px] text-ink-500 mb-1">To</p>
                <DatePicker value={to} onChange={setTo} maxDate={today} />
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-500">
            One lesson gives an Attendance grid (students down, dates across), a Records tab with every mark, and for lessons that use credits a Credits tab. “All lessons” gives
            one grid per lesson plus one tab of all records.
          </p>

          <div className="flex gap-3 pt-1">
            <button onClick={handleExport} disabled={busy} className="btn-primary inline-flex items-center gap-1.5">
              <Download size={15} /> {busy ? 'Preparing…' : 'Download Excel file'}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
