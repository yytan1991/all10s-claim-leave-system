import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Clock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import AppLayout from '../components/AppLayout'
import { EmptyState } from '../components/UI'
import { formatDate, formatTime, formatHours, hoursBetween, toISODate } from '../lib/helpers'

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
  const [dailyRows, setDailyRows] = useState([])
  const [monthlyRows, setMonthlyRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, department, work_start_time, work_end_time')
      .order('full_name')
      .then(({ data }) => setProfiles(data || []))
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

    const summary = {}
    profiles.forEach((p) => {
      summary[p.id] = { profile: p, daysPresent: 0, daysLate: 0, totalHours: 0 }
    })
    ;(data || []).forEach((r) => {
      const s = summary[r.profile_id]
      if (!s) return
      s.daysPresent += 1
      if (r.is_late) s.daysLate += 1
      const hrs = hoursBetween(r.clock_in_at, r.clock_out_at)
      if (hrs) s.totalHours += hrs
    })
    setMonthlyRows(Object.values(summary))
    setLoading(false)
  }

  function exportDaily() {
    const rows = dailyRows.map(({ profile, record }) => ({
      Name: profile.full_name,
      Department: profile.department || '',
      Date: date,
      'Clock In': record?.clock_in_at ? formatTime(record.clock_in_at) : '',
      'Clock Out': record?.clock_out_at ? formatTime(record.clock_out_at) : '',
      'Hours Worked': record ? (hoursBetween(record.clock_in_at, record.clock_out_at) || 0).toFixed(2) : '',
      Late: record?.is_late ? 'Yes' : record ? 'No' : '',
      Status: record ? 'Present' : 'Not clocked in',
    }))
    downloadXlsx(rows, `attendance-daily-${date}.xlsx`)
  }

  function exportMonthly() {
    const rows = monthlyRows.map((s) => ({
      Name: s.profile.full_name,
      Department: s.profile.department || '',
      Month: month,
      'Days Present': s.daysPresent,
      'Days Late': s.daysLate,
      'Total Hours Worked': s.totalHours.toFixed(2),
    }))
    downloadXlsx(rows, `attendance-monthly-${month}.xlsx`)
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
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : tab === 'daily' ? (
        <DailyTable rows={dailyRows} />
      ) : (
        <MonthlyTable rows={monthlyRows} />
      )}
    </AppLayout>
  )
}

function DailyTable({ rows }) {
  if (rows.length === 0) {
    return <EmptyState icon={Clock} title="No staff found" description="Invite staff to see attendance here." />
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-sand-100 text-ink-500 text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Staff</th>
            <th className="px-5 py-3 font-medium">Department</th>
            <th className="px-5 py-3 font-medium">Clock in</th>
            <th className="px-5 py-3 font-medium">Clock out</th>
            <th className="px-5 py-3 font-medium">Hours</th>
            <th className="px-5 py-3 font-medium">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map(({ profile, record }) => (
            <tr key={profile.id}>
              <td className="px-5 py-3 font-medium text-ink-900">{profile.full_name}</td>
              <td className="px-5 py-3 text-ink-500">{profile.department || '—'}</td>
              {!record ? (
                <td colSpan={3} className="px-5 py-3 text-ink-500 italic">
                  Not clocked in
                </td>
              ) : (
                <>
                  <td className={`px-5 py-3 font-medium ${record.is_late ? 'text-rose-600' : 'text-ink-700'}`}>
                    {formatTime(record.clock_in_at)}
                    {record.is_late && <span className="ml-1.5 badge-rejected">Late</span>}
                  </td>
                  <td className="px-5 py-3 text-ink-700">{formatTime(record.clock_out_at)}</td>
                  <td className="px-5 py-3 text-ink-700">
                    {formatHours(hoursBetween(record.clock_in_at, record.clock_out_at))}
                  </td>
                </>
              )}
              <td className="px-5 py-3 text-ink-500">{record?.work_locations?.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
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
