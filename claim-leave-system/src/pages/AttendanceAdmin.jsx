import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Clock, Pencil, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import {
  formatDate,
  formatDateWithDay,
  formatTime,
  formatHours,
  formatHoursDecimal,
  netHoursWorked,
  lunchHours,
  toISODate,
  isLateClockIn,
} from '../lib/helpers'

const TABS = [
  { key: 'daily', label: 'Daily log' },
  { key: 'monthly', label: 'Monthly summary' },
]

function todayStr() {
  return toISODate(new Date())
}
function currentMonthStr() {
  return toISODate(new Date()).slice(0, 7) // YYYY-MM
}

export default function AttendanceAdmin() {
  const [tab, setTab] = useState('daily')
  const [date, setDate] = useState(todayStr())
  const [month, setMonth] = useState(currentMonthStr())
  const [profiles, setProfiles] = useState([])
  const [locations, setLocations] = useState([])
  const [dailyRows, setDailyRows] = useState([])
  const [monthlyRows, setMonthlyRows] = useState([])
  const [monthlyRawRecords, setMonthlyRawRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, department, work_start_time, work_end_time')
      .order('full_name')
      .then(({ data }) => setProfiles(data || []))
    supabase
      .from('work_locations')
      .select('*')
      .order('name')
      .then(({ data }) => setLocations(data || []))
  }, [])

  useEffect(() => {
    if (profiles.length === 0) return
    if (tab === 'daily') loadDaily()
    else loadMonthly()
  }, [tab, date, month, profiles])

  async function loadDaily() {
    setLoading(true)
    const { data } = await supabase
      .from('attendance_records')
      .select('*, work_locations(name)')
      .eq('date', date)
    const byProfile = {}
    ;(data || []).forEach((r) => {
      byProfile[r.profile_id] = r
    })
    const merged = profiles.map((p) => ({ profile: p, record: byProfile[p.id] || null }))
    setDailyRows(merged)
    setLoading(false)
  }

  async function loadMonthly() {
    setLoading(true)
    const start = `${month}-01`
    const endDate = new Date(start)
    endDate.setMonth(endDate.getMonth() + 1)
    const end = endDate.toISOString().slice(0, 10)

    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .gte('date', start)
      .lt('date', end)

    setMonthlyRawRecords(data || [])

    const summary = {}
    profiles.forEach((p) => {
      summary[p.id] = { profile: p, daysPresent: 0, daysLate: 0, totalHours: 0 }
    })
    ;(data || []).forEach((r) => {
      const s = summary[r.profile_id]
      if (!s) return
      s.daysPresent += 1
      if (r.is_late) s.daysLate += 1
      const net = netHoursWorked(r)
      if (net) s.totalHours += net
    })
    setMonthlyRows(Object.values(summary))
    setLoading(false)
  }

  function exportDaily() {
    const rows = dailyRows.map(({ profile, record }) => ({
      Name: profile.full_name,
      Department: profile.department || '',
      Date: formatDateWithDay(date),
      'Clock In': record?.clock_in_at ? formatTime(record.clock_in_at) : '',
      'Clock Out': record?.clock_out_at ? formatTime(record.clock_out_at) : '',
      'Lunch Start': record?.lunch_start_at ? formatTime(record.lunch_start_at) : '',
      'Lunch End': record?.lunch_end_at ? formatTime(record.lunch_end_at) : '',
      'Lunch Duration (hrs)': record ? formatHoursDecimal(lunchHours(record)) : '',
      'Hours Worked (hrs)': record ? formatHoursDecimal(netHoursWorked(record) || 0) : '',
      'Hours Worked (h:mm)': record ? formatHours(netHoursWorked(record)) : '',
      Late: record?.is_late ? 'Yes' : record ? 'No' : '',
      Status: record ? 'Present' : 'Not clocked in',
      Location: record?.work_locations?.name || '',
    }))
    downloadXlsx(rows, `attendance-daily-${date}.xlsx`)
  }

  function exportMonthly() {
    const wb = XLSX.utils.book_new()

    // Lookup: profile_id -> { "YYYY-MM-DD" -> record }
    const byProfileDate = {}
    monthlyRawRecords.forEach((r) => {
      if (!byProfileDate[r.profile_id]) byProfileDate[r.profile_id] = {}
      byProfileDate[r.profile_id][r.date] = r
    })

    // Every calendar date in the selected month
    const [y, m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const allDates = Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(y, m - 1, i + 1)))

    // ---------- Team Summary sheet: one row per staff, one column per date ----------
    const teamHeader = ['Name', 'Department', ...allDates.map((d) => formatDate(d)), 'Total Hours']
    const teamRows = [teamHeader]
    profiles.forEach((p) => {
      const row = [p.full_name, p.department || '']
      let total = 0
      allDates.forEach((d) => {
        const rec = byProfileDate[p.id]?.[d]
        const net = rec ? netHoursWorked(rec) : null
        if (net) total += net
        row.push(net != null ? Number(net.toFixed(2)) : '-')
      })
      row.push(Number(total.toFixed(2)))
      teamRows.push(row)
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teamRows), 'Team Summary')

    // ---------- One detail sheet per staff member ----------
    const usedNames = new Set()
    profiles.forEach((p) => {
      const rows = [
        ['Monthly Timesheet', '', '', '', '', '', 'ALL10S ERP'],
        [],
        ['Month', `${formatDate(allDates[0])} - ${formatDate(allDates[allDates.length - 1])}`],
        [],
        ['Member', p.full_name],
        ['Department', p.department || ''],
        [],
        ['DATE', 'DAY', 'CLOCK IN', 'CLOCK OUT', 'LUNCH START', 'LUNCH END', 'HOURS WORKED', 'LATE'],
      ]
      let total = 0
      allDates.forEach((d) => {
        const rec = byProfileDate[p.id]?.[d]
        if (!rec) return
        const net = netHoursWorked(rec) || 0
        total += net
        rows.push([
          formatDate(d),
          new Date(d).toLocaleDateString('en-MY', { weekday: 'long' }),
          rec.clock_in_at ? formatTime(rec.clock_in_at) : '',
          rec.clock_out_at ? formatTime(rec.clock_out_at) : '',
          rec.lunch_start_at ? formatTime(rec.lunch_start_at) : '',
          rec.lunch_end_at ? formatTime(rec.lunch_end_at) : '',
          Number(net.toFixed(2)),
          rec.is_late ? 'Yes' : 'No',
        ])
      })
      rows.push(['', '', '', '', '', 'Total Hours', Number(total.toFixed(2)), ''])

      let sheetName = p.full_name.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || 'Staff'
      let suffix = 2
      while (usedNames.has(sheetName)) {
        sheetName = `${p.full_name.slice(0, 24)} (${suffix})`
        suffix += 1
      }
      usedNames.add(sheetName)

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
    })

    XLSX.writeFile(wb, `attendance-monthly-${month}.xlsx`)
  }

  function downloadXlsx(rows, filename) {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, filename)
  }

  return (
    <AppLayout title="Attendance" subtitle="Daily clock-in log and monthly working-hour summary.">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2 border-b border-sand-200 sm:border-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-500 hover:text-ink-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {tab === 'daily' ? (
            <input
              type="date"
              className="field-input w-auto"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          ) : (
            <input
              type="month"
              className="field-input w-auto"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          )}
          <button
            onClick={tab === 'daily' ? exportDaily : exportMonthly}
            className="btn-secondary"
          >
            <Download size={15} /> Export to Excel
          </button>
          {tab === 'daily' && (
            <button onClick={() => setEditingEntry({ profile: null, record: null })} className="btn-primary">
              <Pencil size={15} /> Manual entry
            </button>
          )}
        </div>
      </div>

      {tab === 'daily' && (
        <p className="text-sm text-ink-500 mb-4">{formatDateWithDay(date)}</p>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : tab === 'daily' ? (
        <DailyTable rows={dailyRows} onEdit={(profile, record) => setEditingEntry({ profile, record })} />
      ) : (
        <MonthlyTable rows={monthlyRows} />
      )}

      {editingEntry && (
        <ManualEntryModal
          profile={editingEntry.profile}
          record={editingEntry.record}
          date={date}
          profiles={profiles}
          locations={locations}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null)
            loadDaily()
          }}
        />
      )}
    </AppLayout>
  )
}

function DailyTable({ rows, onEdit }) {
  if (rows.length === 0) {
    return <EmptyState icon={Clock} title="No staff found" description="Invite staff to see attendance here." />
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-sand-100 text-ink-500 text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Staff</th>
            <th className="px-5 py-3 font-medium">Department</th>
            <th className="px-5 py-3 font-medium">Clock in</th>
            <th className="px-5 py-3 font-medium">Clock out</th>
            <th className="px-5 py-3 font-medium">Lunch</th>
            <th className="px-5 py-3 font-medium">Hours</th>
            <th className="px-5 py-3 font-medium">Location</th>
            <th className="px-5 py-3 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map(({ profile, record }) => (
            <tr key={profile.id}>
              <td className="px-5 py-3 font-medium text-ink-900">{profile.full_name}</td>
              <td className="px-5 py-3 text-ink-500">{profile.department || '—'}</td>
              {!record ? (
                <td colSpan={4} className="px-5 py-3 text-ink-500 italic">
                  Not clocked in
                </td>
              ) : (
                <>
                  <td className={`px-5 py-3 font-medium ${record.is_late ? 'text-rose-600' : 'text-ink-700'}`}>
                    {formatTime(record.clock_in_at)}
                    {record.is_late && <span className="ml-1.5 badge-rejected">Late</span>}
                  </td>
                  <td className="px-5 py-3 text-ink-700">{formatTime(record.clock_out_at)}</td>
                  <td className="px-5 py-3 text-ink-500 text-xs">
                    {record.lunch_start_at
                      ? `${formatTime(record.lunch_start_at)}–${formatTime(record.lunch_end_at)}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-ink-700">{formatHours(netHoursWorked(record))}</td>
                </>
              )}
              <td className="px-5 py-3 text-ink-500">{record?.work_locations?.name || '—'}</td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onEdit(profile, record)}
                  className="text-brand-600 hover:underline text-xs font-medium"
                >
                  {record ? 'Edit' : 'Add entry'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

function ManualEntryModal({ profile, record, date, profiles, locations, onClose, onSaved }) {
  const [profileId, setProfileId] = useState(profile?.id || record?.profile_id || '')
  const [entryDate, setEntryDate] = useState(record?.date || date)
  const [clockInTime, setClockInTime] = useState(record?.clock_in_at ? toTimeInput(record.clock_in_at) : '')
  const [clockOutTime, setClockOutTime] = useState(record?.clock_out_at ? toTimeInput(record.clock_out_at) : '')
  const [lunchStartTime, setLunchStartTime] = useState(
    record?.lunch_start_at ? toTimeInput(record.lunch_start_at) : ''
  )
  const [lunchEndTime, setLunchEndTime] = useState(record?.lunch_end_at ? toTimeInput(record.lunch_end_at) : '')
  const [locationId, setLocationId] = useState(record?.work_location_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedProfile = profiles.find((p) => p.id === profileId)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!profileId) {
      setError('Choose which staff member this entry is for.')
      return
    }
    if (!entryDate) {
      setError('Choose a date.')
      return
    }
    if (!clockInTime) {
      setError('Clock-in time is required.')
      return
    }
    if ((lunchStartTime && !lunchEndTime) || (!lunchStartTime && lunchEndTime)) {
      setError('Lunch start and end must both be filled in, or both left blank.')
      return
    }

    setSaving(true)

    const clockInISO = new Date(`${entryDate}T${clockInTime}:00`).toISOString()
    const clockOutISO = clockOutTime ? new Date(`${entryDate}T${clockOutTime}:00`).toISOString() : null
    const lunchStartISO = lunchStartTime ? new Date(`${entryDate}T${lunchStartTime}:00`).toISOString() : null
    const lunchEndISO = lunchEndTime ? new Date(`${entryDate}T${lunchEndTime}:00`).toISOString() : null
    const late = isLateClockIn(clockInISO, selectedProfile?.work_start_time)

    const { error: upsertError } = await supabase.from('attendance_records').upsert(
      {
        profile_id: profileId,
        date: entryDate,
        clock_in_at: clockInISO,
        clock_out_at: clockOutISO,
        lunch_start_at: lunchStartISO,
        lunch_end_at: lunchEndISO,
        work_location_id: locationId || null,
        is_late: late,
      },
      { onConflict: 'profile_id,date' }
    )

    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">
            {record ? 'Edit attendance entry' : 'Manual attendance entry'}
          </h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}

          <div>
            <label className="field-label">Staff</label>
            <select
              className="field-input"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              disabled={Boolean(profile || record)}
            >
              <option value="">— Select staff —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Date</label>
            <input
              type="date"
              className="field-input"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              disabled={Boolean(record)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Clock in</label>
              <input
                type="time"
                className="field-input"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Clock out</label>
              <input
                type="time"
                className="field-input"
                value={clockOutTime}
                onChange={(e) => setClockOutTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Lunch start</label>
              <input
                type="time"
                className="field-input"
                value={lunchStartTime}
                onChange={(e) => setLunchStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Lunch end</label>
              <input
                type="time"
                className="field-input"
                value={lunchEndTime}
                onChange={(e) => setLunchEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Location (optional)</label>
            <select className="field-input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">No location (manual entry)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save entry'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Extracts "HH:MM" in local time from a timestamptz value, for a <input type="time">.
function toTimeInput(isoString) {
  const d = new Date(isoString)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function MonthlyTable({ rows }) {
  if (rows.length === 0) {
    return <EmptyState icon={Clock} title="No staff found" description="Invite staff to see attendance here." />
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-sand-100 text-ink-500 text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Staff</th>
            <th className="px-5 py-3 font-medium">Department</th>
            <th className="px-5 py-3 font-medium">Days present</th>
            <th className="px-5 py-3 font-medium">Days late</th>
            <th className="px-5 py-3 font-medium">Total hours</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map(({ profile, daysPresent, daysLate, totalHours }) => (
            <tr key={profile.id}>
              <td className="px-5 py-3 font-medium text-ink-900">{profile.full_name}</td>
              <td className="px-5 py-3 text-ink-500">{profile.department || '—'}</td>
              <td className="px-5 py-3 text-ink-700">{daysPresent}</td>
              <td className={`px-5 py-3 font-medium ${daysLate > 0 ? 'text-rose-600' : 'text-ink-700'}`}>
                {daysLate}
              </td>
              <td className="px-5 py-3 text-ink-700">{formatHours(totalHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}