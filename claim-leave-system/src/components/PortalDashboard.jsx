import { useEffect, useState } from 'react'
import { Megaphone, ClipboardList, Receipt, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/helpers'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatTimeLabel(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

function statusBadge(status) {
  if (status === 'present') return <span className="badge-approved">Present</span>
  if (status === 'absent') return <span className="badge-cancelled">Absent</span>
  if (status === 'late') return <span className="badge-pending">Late</span>
  return <span className="text-ink-400 text-xs">Unmarked</span>
}

export default function PortalDashboard({ student }) {
  const [tab, setTab] = useState('announcements')
  const [announcements, setAnnouncements] = useState([])
  const [attendance, setAttendance] = useState([])
  const [invoices, setInvoices] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (student?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id])

  async function load() {
    setLoading(true)
    const [{ data: ann }, { data: att }, { data: inv }, { data: enroll }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(15),
      supabase
        .from('student_attendance')
        .select('*, classes(name)')
        .eq('student_id', student.id)
        .order('attendance_date', { ascending: false })
        .limit(30),
      supabase.from('student_invoices').select('*').eq('student_id', student.id).order('issue_date', { ascending: false }),
      supabase
        .from('class_enrollments')
        .select('classes(id, name, day_of_week, start_time, end_time, room)')
        .eq('student_id', student.id),
    ])
    setAnnouncements(ann || [])
    setAttendance(att || [])
    setInvoices(inv || [])
    setClasses((enroll || []).map((e) => e.classes).filter(Boolean))
    setLoading(false)
  }

  const TABS = [
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'attendance', label: 'Attendance', icon: ClipboardList },
    { key: 'invoices', label: 'Invoices', icon: Receipt },
    { key: 'schedule', label: 'Class Schedule', icon: CalendarClock },
  ]

  return (
    <div>
      <div className="flex gap-2 border-b border-sand-200 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <>
          {tab === 'announcements' && (
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-ink-500">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <div key={a.id} className="card p-4">
                    {a.pinned && <span className="badge-pending mb-2 inline-block">Pinned</span>}
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: a.content }} />
                    <p className="text-xs text-ink-500 mt-2">{formatDate(a.created_at?.slice(0, 10))}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'attendance' && (
            <div className="card overflow-hidden">
              {attendance.length === 0 ? (
                <p className="text-sm text-ink-500 p-5">No attendance records yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Class</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {attendance.map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-3 text-ink-900">{formatDate(a.attendance_date)}</td>
                        <td className="px-5 py-3 text-ink-700">{a.classes?.name || '—'}</td>
                        <td className="px-5 py-3">{statusBadge(a.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'invoices' && (
            <div className="card overflow-hidden">
              {invoices.length === 0 ? (
                <p className="text-sm text-ink-500 p-5">No invoices yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Invoice</th>
                      <th className="px-5 py-3 font-medium">Issued</th>
                      <th className="px-5 py-3 font-medium">Total</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {invoices.map((inv) => {
                      const payable = Math.max(Number(inv.amount) - Number(inv.payment_amount || 0), 0)
                      return (
                        <tr key={inv.id}>
                          <td className="px-5 py-3 font-medium text-ink-900">
                            INV-{String(inv.invoice_no).padStart(5, '0')}
                          </td>
                          <td className="px-5 py-3 text-ink-700">{formatDate(inv.issue_date)}</td>
                          <td className="px-5 py-3 text-ink-700">RM {Number(inv.amount).toFixed(2)}</td>
                          <td className="px-5 py-3">
                            {inv.status === 'paid' ? (
                              <span className="badge-approved">Paid</span>
                            ) : inv.status === 'partial' ? (
                              <span className="badge-pending">Partial — RM {payable.toFixed(2)} due</span>
                            ) : inv.status === 'cancelled' ? (
                              <span className="badge-cancelled">Cancelled</span>
                            ) : (
                              <span className="badge-pending">Unpaid — RM {payable.toFixed(2)} due</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'schedule' && (
            <div className="card overflow-hidden">
              {classes.length === 0 ? (
                <p className="text-sm text-ink-500 p-5">Not enrolled in any classes yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Class</th>
                      <th className="px-5 py-3 font-medium">Day &amp; time</th>
                      <th className="px-5 py-3 font-medium">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {classes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-3 font-medium text-ink-900">{c.name}</td>
                        <td className="px-5 py-3 text-ink-700">
                          {DAY_NAMES[c.day_of_week]} · {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                        </td>
                        <td className="px-5 py-3 text-ink-500">{c.room || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
