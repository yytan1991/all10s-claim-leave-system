import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, School, UserCog, Receipt, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatCard } from '../components/UI'
import { formatDate } from '../lib/helpers'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [teacherLinks, setTeacherLinks] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    const [{ data: studentData }, { data: classData }, { data: teacherData }, { data: invoiceData }] = await Promise.all([
      supabase.from('students').select('id').eq('org_id', profile.org_id),
      supabase.from('classes').select('id').eq('org_id', profile.org_id),
      supabase.from('class_teachers').select('teacher_id').eq('org_id', profile.org_id),
      supabase
        .from('student_invoices')
        .select('id, amount, payment_amount, status, issue_date, students(full_name)')
        .eq('org_id', profile.org_id),
    ])
    setStudents(studentData || [])
    setClasses(classData || [])
    setTeacherLinks(teacherData || [])
    setInvoices(invoiceData || [])
    setLoading(false)
  }

  const activeTeachers = new Set(teacherLinks.map((t) => t.teacher_id)).size

  const today = new Date().toISOString().slice(0, 10)
  const thisMonthPrefix = today.slice(0, 7)

  const thisMonthInvoices = invoices.filter((i) => i.issue_date?.slice(0, 7) === thisMonthPrefix)
  const thisMonthRevenue = thisMonthInvoices.reduce((s, i) => s + Number(i.payment_amount || 0), 0)
  const outstanding = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Math.max(Number(i.amount) - Number(i.payment_amount || 0), 0), 0)
  const overdueInvoices = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.issue_date < today)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date))

  // Revenue collected per month, last 6 months
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-MY', { month: 'short' }) }
  })
  const revenueByMonth = months.map(({ key, label }) => {
    const total = invoices
      .filter((i) => i.issue_date?.slice(0, 7) === key)
      .reduce((s, i) => s + Number(i.payment_amount || 0), 0)
    return { label, total }
  })
  const maxRevenue = Math.max(1, ...revenueByMonth.map((m) => m.total))

  return (
    <AppLayout title="Student Management" subtitle="Enrollment, classes, and billing at a glance.">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">Revenue collected, last 6 months</h3>
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-40">
              {revenueByMonth.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs text-ink-500">RM {m.total.toFixed(0)}</span>
                  <div className="w-full flex items-end h-28">
                    <div
                      className="w-full rounded-t bg-brand-500"
                      style={{ height: `${(m.total / maxRevenue) * 100}%`, minHeight: m.total > 0 ? '4px' : '0px' }}
                    />
                  </div>
                  <span className="text-xs text-ink-500">{m.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-ink-700">
            This month: <span className="font-semibold">RM {thisMonthRevenue.toFixed(2)}</span> collected
          </p>
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

      <div className="mt-6 flex justify-end gap-2">
        <Link to="/invoices" className="btn-secondary text-sm">
          <Receipt size={14} /> View all invoices
        </Link>
        <Link to="/students" className="btn-secondary text-sm">
          View all students
        </Link>
      </div>
    </AppLayout>
  )
}
