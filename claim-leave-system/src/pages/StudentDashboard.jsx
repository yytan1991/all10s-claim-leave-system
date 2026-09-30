import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, School, UserCog, AlertTriangle, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatCard } from '../components/UI'
import { formatDate } from '../lib/helpers'

function todayAppDow() {
  const jsDay = new Date().getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [teacherLinks, setTeacherLinks] = useState([])
  const [invoices, setInvoices] = useState([])
  const [todayAttendance, setTodayAttendance] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [
      { data: studentData },
      { data: classData },
      { data: teacherData },
      { data: invoiceData },
      { data: attendanceData },
    ] = await Promise.all([
      supabase.from('students').select('id').eq('org_id', profile.org_id),
      supabase.from('classes').select('id, name, day_of_week').eq('org_id', profile.org_id),
      supabase.from('class_teachers').select('teacher_id').eq('org_id', profile.org_id),
      supabase
        .from('student_invoices')
        .select('id, amount, payment_amount, status, issue_date, students(full_name)')
        .eq('org_id', profile.org_id),
      supabase
        .from('student_attendance')
        .select('class_id, status')
        .eq('org_id', profile.org_id)
        .eq('attendance_date', today),
    ])
    setStudents(studentData || [])
    setClasses(classData || [])
    setTeacherLinks(teacherData || [])
    setInvoices(invoiceData || [])
    setTodayAttendance(attendanceData || [])
    setLoading(false)
  }

  const activeTeachers = new Set(teacherLinks.map((t) => t.teacher_id)).size

  const today = new Date().toISOString().slice(0, 10)
  const thisMonthPrefix = today.slice(0, 7)

  const outstanding = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Math.max(Number(i.amount) - Number(i.payment_amount || 0), 0), 0)
  const overdueInvoices = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.issue_date < today)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date))

  // Classes scheduled today, with their attendance counts.
  const classesToday = classes.filter((c) => c.day_of_week === todayAppDow())
  const attendanceByClass = {}
  todayAttendance.forEach((a) => {
    if (!attendanceByClass[a.class_id]) attendanceByClass[a.class_id] = { present: 0, absent: 0, late: 0 }
    attendanceByClass[a.class_id][a.status] = (attendanceByClass[a.class_id][a.status] || 0) + 1
  })

  // Sales (total billed) and pending collection, grouped by invoice issue
  // month, last 6 months.
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-MY', { month: 'short' }) }
  })
  const byMonth = months.map(({ key, label }) => {
    const monthInvoices = invoices.filter((i) => i.status !== 'cancelled' && i.issue_date?.slice(0, 7) === key)
    const sales = monthInvoices.reduce((s, i) => s + Number(i.amount), 0)
    const pending = monthInvoices.reduce((s, i) => s + Math.max(Number(i.amount) - Number(i.payment_amount || 0), 0), 0)
    return { label, sales, pending }
  })
  const maxAmount = Math.max(1, ...byMonth.flatMap((m) => [m.sales, m.pending]))

  const thisMonthSales = byMonth[byMonth.length - 1]?.sales || 0
  const thisMonthPending = byMonth[byMonth.length - 1]?.pending || 0

  return (
    <AppLayout title="Student Management" subtitle="Enrollment, attendance, and billing at a glance.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total students" value={loading ? '—' : students.length} icon={Users2} tone="brand" />
        <StatCard label="Total classes" value={loading ? '—' : classes.length} icon={School} tone="brand" />
        <StatCard label="Active teachers" value={loading ? '—' : activeTeachers} icon={UserCog} tone="brand" />
        <StatCard
          label="Outstanding amount"
          value={loading ? '—' : `RM ${outstanding.toFixed(2)}`}
          hint={overdueInvoices.length > 0 ? `${overdueInvoices.length} overdue` : undefined}
          icon={AlertTriangle}
          tone={overdueInvoices.length > 0 ? 'amber' : 'brand'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">Today's class attendance</h3>
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : classesToday.length === 0 ? (
            <p className="text-sm text-ink-500">No classes scheduled today.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {classesToday.map((c) => {
                const counts = attendanceByClass[c.id] || {}
                return (
                  <div key={c.id} className="flex items-center justify-between px-1 py-1.5 text-sm">
                    <span className="text-ink-900">{c.name}</span>
                    <span className="text-xs text-ink-500">
                      {counts.present || 0} present · {counts.absent || 0} absent · {counts.late || 0} late
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <Link to="/student-attendance" className="btn-secondary text-xs mt-4 inline-flex">
            <ClipboardList size={13} /> Mark attendance
          </Link>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">Overdue invoices</h3>
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : overdueInvoices.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing overdue — nice.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overdueInvoices.slice(0, 8).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-1 py-1.5 text-sm">
                  <div>
                    <p className="text-ink-900">{inv.students?.full_name}</p>
                    <p className="text-xs text-ink-500">Issued {formatDate(inv.issue_date)}</p>
                  </div>
                  <span className="text-rose-600 font-medium">
                    RM {(Number(inv.amount) - Number(inv.payment_amount || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
              {overdueInvoices.length > 8 && (
                <p className="text-xs text-ink-500 pt-1">+{overdueInvoices.length - 8} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-ink-900 mb-4">Sales vs pending collection, last 6 months</h3>
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-xs text-ink-500 mb-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Total sales
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Pending collection
              </span>
            </div>
            <div className="flex items-end justify-between gap-3 h-40">
              {byMonth.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end gap-1 h-28">
                    <div
                      className="flex-1 rounded-t bg-brand-500"
                      style={{ height: `${(m.sales / maxAmount) * 100}%`, minHeight: m.sales > 0 ? '4px' : '0px' }}
                    />
                    <div
                      className="flex-1 rounded-t bg-rose-400"
                      style={{ height: `${(m.pending / maxAmount) * 100}%`, minHeight: m.pending > 0 ? '4px' : '0px' }}
                    />
                  </div>
                  <span className="text-xs text-ink-500">{m.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-700">
              This month: <span className="font-semibold">RM {thisMonthSales.toFixed(2)}</span> in sales,{' '}
              <span className="font-semibold text-rose-600">RM {thisMonthPending.toFixed(2)}</span> still pending
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Link to="/invoices" className="btn-secondary text-sm">
          View all invoices
        </Link>
        <Link to="/students" className="btn-secondary text-sm">
          View all students
        </Link>
      </div>
    </AppLayout>
  )
}
