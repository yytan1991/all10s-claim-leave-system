import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Users2, MoreVertical, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import DatePicker from '../components/DatePicker'
import { Alert, EmptyState } from '../components/UI'
import { QuickPayModal } from './InvoicesPage'
import { generateInvoicePdf } from '../lib/invoicePdf'
import BillingPromptModal from '../components/BillingPromptModal'
import { formatDate, getMonthGrid, toISODate, DAY_NAMES, formatTimeLabel, RECURRENCE_OPTIONS } from '../lib/helpers'

function ageFrom(dob) {
  if (!dob) return null
  const d = new Date(`${dob}T00:00:00`)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

export default function StudentsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [classNames, setClassNames] = useState({}) // studentId -> [class names]
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')

  const [adding, setAdding] = useState(false)
  const [detailsFor, setDetailsFor] = useState(null)
  const [invoicesFor, setInvoicesFor] = useState(null) // { student, unpaidOnly }
  const [calendarFor, setCalendarFor] = useState(null)
  const [payTarget, setPayTarget] = useState(null) // { invoice, student }

  async function load() {
    setLoading(true)
    const [{ data: studentRows }, { data: enrollRows }, { data: methods }] = await Promise.all([
      supabase.from('students').select('*').eq('org_id', profile.org_id).order('full_name'),
      supabase.from('class_enrollments').select('student_id, classes(name)').eq('org_id', profile.org_id),
      supabase.from('invoice_payment_methods').select('*').eq('org_id', profile.org_id).order('name'),
    ])
    setRows(studentRows || [])
    setPaymentMethods(methods || [])
    const map = {}
    ;(enrollRows || []).forEach((e) => {
      if (!e.classes?.name) return
      if (!map[e.student_id]) map[e.student_id] = []
      map[e.student_id].push(e.classes.name)
    })
    Object.values(map).forEach((list) => list.sort((a, b) => a.localeCompare(b)))
    setClassNames(map)
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  const archivedCount = rows.filter((r) => r.archived_at).length
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => Boolean(r.archived_at) === showArchived)
      .filter((r) => {
        if (!q) return true
        return [r.full_name, r.parent_name, r.parent_contact, r.parent_email].some((v) => (v || '').toLowerCase().includes(q))
      })
  }, [rows, search, showArchived])

  async function startPay(student) {
    setError('')
    const { data, error: loadError } = await supabase
      .from('student_invoices')
      .select('*')
      .eq('student_id', student.id)
      .in('status', ['unpaid', 'partial'])
      .order('issue_date', { ascending: true })
    if (loadError) {
      setError(loadError.message)
      return
    }
    if (!data || data.length === 0) {
      alert(`${student.full_name} has no unpaid invoices.`)
      return
    }
    if (data.length === 1) setPayTarget({ invoice: data[0], student })
    else setInvoicesFor({ student, unpaidOnly: true })
  }

  async function archiveStudent(student) {
    const classes = classNames[student.id] || []
    const ok = confirm(
      `Archive ${student.full_name}?\n\n` +
        `• They are hidden from this list (you can find them under "Show archived").\n` +
        `• No more automatic invoices are created for them.\n` +
        (classes.length ? `• They are removed from: ${classes.join(', ')}.\n` : '') +
        `• Their invoices, payments and attendance history are kept.`
    )
    if (!ok) return
    setError('')
    const { error: updateError } = await supabase.from('students').update({ archived_at: new Date().toISOString() }).eq('id', student.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await supabase.from('class_enrollments').delete().eq('student_id', student.id)
    load()
  }

  async function restoreStudent(student) {
    setError('')
    const { error: updateError } = await supabase.from('students').update({ archived_at: null }).eq('id', student.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  function menuItems(s) {
    if (s.archived_at) {
      return [
        { label: 'View and edit details', onClick: () => setDetailsFor(s) },
        { label: 'Invoices and payments', onClick: () => setInvoicesFor({ student: s, unpaidOnly: false }) },
        { label: 'Attendance calendar', onClick: () => setCalendarFor(s) },
        { label: 'Restore student', onClick: () => restoreStudent(s), tone: 'brand' },
      ]
    }
    return [
      { label: 'View and edit details', onClick: () => setDetailsFor(s) },
      { label: 'Invoices and payments', onClick: () => setInvoicesFor({ student: s, unpaidOnly: false }) },
      { label: 'Attendance calendar', onClick: () => setCalendarFor(s) },
      { label: 'Pay invoice', onClick: () => startPay(s), tone: 'brand' },
      { label: 'Archive', onClick: () => archiveStudent(s), tone: 'danger' },
    ]
  }

  return (
    <AppLayout title="Students" subtitle="Student records. Use the ⋮ menu on a row for details, invoices, attendance and payments.">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="field-input pl-9"
            placeholder="Search name, parent, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
        <div className="flex-1" />
        <button onClick={() => setAdding(true)} className="btn-primary text-sm">
          <Plus size={15} /> Add student
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users2}
            title={showArchived ? 'No archived students' : search ? 'No students match your search' : 'No students yet'}
            description={showArchived ? 'Archived students appear here.' : 'Add your first student above.'}
          />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium w-[22%]">Student</th>
                <th className="px-4 py-3 font-medium w-[26%]">Enrolled lessons</th>
                <th className="px-4 py-3 font-medium w-[14%]">Date of birth</th>
                <th className="px-4 py-3 font-medium w-[30%]">Parent contact</th>
                <th className="px-4 py-3 font-medium w-[8%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {visible.map((r) => {
                const lessons = classNames[r.id] || []
                const age = ageFrom(r.date_of_birth)
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-ink-900 break-words">{r.full_name}</td>
                    <td className="px-4 py-3">
                      {lessons.length === 0 ? (
                        <span className="text-ink-500">—</span>
                      ) : (
                        lessons.map((n) => (
                          <span key={n} className="inline-block rounded-full bg-sand-100 text-ink-700 text-xs px-2 py-0.5 mr-1 mb-1">
                            {n}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {r.date_of_birth ? (
                        <>
                          {formatDate(r.date_of_birth)}
                          {age !== null && <span className="block text-xs text-ink-500">{age} years old</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.parent_name && <p className="text-ink-900 break-words">{r.parent_name}</p>}
                      {r.parent_contact && <p className="text-xs text-ink-700">{r.parent_contact}</p>}
                      {r.parent_email && <p className="text-xs text-ink-500 break-all">{r.parent_email}</p>}
                      {!r.parent_name && !r.parent_contact && !r.parent_email && <span className="text-ink-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu items={menuItems(r)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <AddStudentModal
          orgId={profile.org_id}
          createdBy={profile.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}

      {detailsFor && (
        <StudentDetailsModal
          student={detailsFor}
          createdBy={profile.id}
          onClose={() => setDetailsFor(null)}
          onSaved={() => {
            setDetailsFor(null)
            load()
          }}
        />
      )}

      {invoicesFor && (
        <StudentInvoicesModal
          student={invoicesFor.student}
          initialUnpaidOnly={invoicesFor.unpaidOnly}
          paymentMethods={paymentMethods}
          onClose={() => setInvoicesFor(null)}
        />
      )}

      {calendarFor && <AttendanceCalendarModal student={calendarFor} onClose={() => setCalendarFor(null)} />}

      {payTarget && (
        <QuickPayModal
          invoice={payTarget.invoice}
          students={[payTarget.student]}
          paymentMethods={paymentMethods}
          onClose={() => setPayTarget(null)}
          onSaved={() => {}}
        />
      )}
    </AppLayout>
  )
}

// ⋮ menu — drawn on top of the page so the table never clips it.
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = items.length * 36 + 12
      const upward = window.innerHeight - rect.bottom < menuHeight
      setPos({
        top: upward ? rect.top - menuHeight : rect.bottom + 4,
        left: Math.max(8, rect.right - 208),
      })
    }
    setOpen((o) => !o)
  }

  const tone = { brand: 'text-brand-700 hover:bg-sand-50', danger: 'text-rose-600 hover:bg-rose-50' }

  return (
    <div className="inline-block text-left">
      <button ref={btnRef} onClick={toggle} className="text-ink-500 hover:text-ink-900 p-1" aria-label="Student actions">
        <MoreVertical size={16} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="fixed z-50 w-52 card py-1 shadow-lg bg-white" style={{ top: pos.top, left: pos.left }}>
              {items.map((it) => (
                <button
                  key={it.label}
                  onClick={() => {
                    setOpen(false)
                    it.onClick()
                  }}
                  className={`w-full text-left px-3 py-2 text-sm ${tone[it.tone] || 'text-ink-700 hover:bg-sand-50'}`}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}

function Modal({ title, onClose, children, wide = false, xl = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className={`card w-full ${xl ? 'max-w-5xl p-8 max-h-[92vh]' : `${wide ? 'max-w-3xl' : 'max-w-md'} p-6 max-h-[90vh]`} overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddStudentModal({ orgId, createdBy, onClose, onSaved }) {
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentContact, setParentContact] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) {
      setError("Enter the student's name.")
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('students').insert({
      org_id: orgId,
      full_name: fullName.trim(),
      date_of_birth: dob || null,
      parent_name: parentName.trim() || null,
      parent_contact: parentContact.trim() || null,
      parent_email: parentEmail.trim().toLowerCase() || null,
      created_by: createdBy,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title="Add student" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Student name</label>
          <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Date of birth (optional)</label>
          <DatePicker value={dob} onChange={setDob} maxDate={toISODate(new Date())} />
        </div>
        <div>
          <label className="field-label">Parent name (optional)</label>
          <input className="field-input" value={parentName} onChange={(e) => setParentName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Parent phone</label>
            <input className="field-input" value={parentContact} onChange={(e) => setParentContact(e.target.value)} placeholder="012-345 6789" />
          </div>
          <div>
            <label className="field-label">Parent email</label>
            <input type="email" className="field-input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Add student'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Same period wording as the Lessons page, e.g. "October 2026" or "October 2026 - December 2026"
function computePeriodLabel(dateStr, intervalMonths) {
  if (!dateStr) return ''
  const start = new Date(`${dateStr}T00:00:00`)
  const startLabel = start.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  const months = Number(intervalMonths) || 1
  if (months <= 1) return startLabel
  const end = new Date(start)
  end.setMonth(end.getMonth() + months - 1)
  return `${startLabel} - ${end.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}`
}

function StudentDetailsModal({ student, createdBy, onClose, onSaved }) {
  const archived = Boolean(student.archived_at)
  const [fullName, setFullName] = useState(student.full_name || '')
  const [dob, setDob] = useState(student.date_of_birth || '')
  const [parentName, setParentName] = useState(student.parent_name || '')
  const [parentContact, setParentContact] = useState(student.parent_contact || '')
  const [parentEmail, setParentEmail] = useState(student.parent_email || '')
  const [lessonList, setLessonList] = useState([])
  const [enrolledIds, setEnrolledIds] = useState(new Set())
  const [checked, setChecked] = useState(new Set())
  const [frequencies, setFrequencies] = useState({}) // lesson id -> months between invoices
  const [loadingLessons, setLoadingLessons] = useState(true)
  const [billingPrompt, setBillingPrompt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('classes').select('*').eq('org_id', student.org_id).order('day_of_week').order('start_time'),
      supabase.from('class_enrollments').select('class_id').eq('student_id', student.id),
    ]).then(([{ data: lessonRows }, { data: enrolRows }]) => {
      const ids = new Set((enrolRows || []).map((e) => e.class_id))
      setLessonList(lessonRows || [])
      setEnrolledIds(ids)
      setChecked(new Set(ids))
      setLoadingLessons(false)
    })
  }, [student.id, student.org_id])

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) {
      setError("Enter the student's name.")
      return
    }
    setSaving(true)

    const { error: updateError } = await supabase
      .from('students')
      .update({
        full_name: fullName.trim(),
        date_of_birth: dob || null,
        parent_name: parentName.trim() || null,
        parent_contact: parentContact.trim() || null,
        parent_email: parentEmail.trim().toLowerCase() || null,
      })
      .eq('id', student.id)
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    if (!archived) {
      const toAdd = [...checked].filter((id) => !enrolledIds.has(id))
      const toRemove = [...enrolledIds].filter((id) => !checked.has(id))

      if (toAdd.length > 0) {
        const { error: addError } = await supabase
          .from('class_enrollments')
          .insert(toAdd.map((classId) => ({ org_id: student.org_id, class_id: classId, student_id: student.id, created_by: createdBy })))
        if (addError) {
          setSaving(false)
          setError(addError.message)
          return
        }
      }
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase.from('class_enrollments').delete().eq('student_id', student.id).in('class_id', toRemove)
        if (removeError) {
          setSaving(false)
          setError(removeError.message)
          return
        }
      }

      // Leaving a lesson shouldn't keep billing for it: offer to stop its recurring invoice too.
      if (toRemove.length > 0) {
        const removedNames = toRemove.map((id) => lessonList.find((l) => l.id === id)?.name).filter(Boolean)
        const { data: plans } = await supabase.from('recurring_invoice_plans').select('id, items').eq('student_id', student.id)
        const affected = (plans || []).filter((p) => (p.items || []).some((it) => removedNames.includes(it.description)))
        const whole = affected.filter((p) => (p.items || []).every((it) => removedNames.includes(it.description)))
        const mixed = affected.filter((p) => !whole.includes(p))
        if (whole.length > 0) {
          const names = [...new Set(whole.flatMap((p) => (p.items || []).map((it) => it.description)))].join(', ')
          const stop = confirm(
            `${student.full_name} has a recurring invoice for ${names}.\n\nStop it now that they have left the lesson?\n\nOK = stop the recurring invoice\nCancel = keep it`
          )
          if (stop) await supabase.from('recurring_invoice_plans').delete().in('id', whole.map((p) => p.id))
        }
        if (mixed.length > 0) {
          const names = [...new Set(mixed.flatMap((p) => (p.items || []).map((it) => it.description).filter((d) => removedNames.includes(d))))].join(', ')
          alert(`${student.full_name} also has a recurring invoice that bills for ${names} together with other lessons. Open Recurring Invoice and remove that line from it.`)
        }
      }

      // Newly enrolled lessons with a billing option get a recurring invoice at the lesson's fee —
      // unless this student already has a recurring invoice for that lesson.
      const wanted = toAdd.filter((id) => frequencies[id])
      if (wanted.length > 0) {
        const { data: existingPlans } = await supabase.from('recurring_invoice_plans').select('items').eq('student_id', student.id)
        const existingNames = new Set((existingPlans || []).flatMap((p) => (p.items || []).map((it) => it.description)))
        const today = toISODate(new Date())
        const rows = []
        const skipped = []
        wanted.forEach((id) => {
          const lesson = lessonList.find((l) => l.id === id)
          if (!lesson) return
          if (existingNames.has(lesson.name)) {
            skipped.push(lesson.name)
            return
          }
          const fee = Number(lesson.fee_amount || 0)
          rows.push({
            org_id: student.org_id,
            student_id: student.id,
            items: [{ description: lesson.name, amount: fee }],
            amount: fee,
            recurrence_interval_months: Number(frequencies[id]),
            next_generation_date: today,
            next_invoice_month: computePeriodLabel(today, frequencies[id]),
            created_by: createdBy,
          })
        })
        if (rows.length > 0) {
          const { error: planError } = await supabase.from('recurring_invoice_plans').insert(rows)
          if (planError) {
            setSaving(false)
            setError(`Lessons were saved, but creating the recurring invoice failed: ${planError.message}`)
            return
          }
        }
        if (skipped.length > 0) {
          alert(`${student.full_name} already has a recurring invoice for ${skipped.join(', ')}, so no new one was created.`)
        }
      }

      // Newly enrolled lessons that have a fee but still no recurring invoice: ask now, so it isn't forgotten.
      if (toAdd.length > 0) {
        const { data: plansNow } = await supabase.from('recurring_invoice_plans').select('items').eq('student_id', student.id)
        const haveNames = new Set((plansNow || []).flatMap((p) => (p.items || []).map((it) => it.description)))
        const missing = toAdd
          .map((id) => lessonList.find((l) => l.id === id))
          .filter((l) => l && l.fee_amount != null && Number(l.fee_amount) > 0 && !haveNames.has(l.name))
          .map((l) => ({
            studentId: student.id,
            studentName: fullName.trim() || student.full_name,
            lessonId: l.id,
            lessonName: l.name,
            fee: Number(l.fee_amount),
          }))
        if (missing.length > 0) {
          setBillingPrompt(missing)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <>
    <Modal title="Student details" onClose={onClose} xl>
      <form onSubmit={handleSave} className="space-y-6">
        {error && <Alert tone="rose">{error}</Alert>}
        {archived && <Alert tone="amber">This student is archived (since {formatDate(student.archived_at.slice(0, 10))}).</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink-900">Student</h4>
            <div>
              <label className="field-label">Student name</label>
              <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Date of birth</label>
              <DatePicker value={dob} onChange={setDob} maxDate={toISODate(new Date())} />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink-900">Parent / guardian</h4>
            <div>
              <label className="field-label">Parent name</label>
              <input className="field-input" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Parent phone</label>
                <input className="field-input" value={parentContact} onChange={(e) => setParentContact(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Parent email</label>
                <input type="email" className="field-input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-sm font-semibold text-ink-900">Enrolled lessons</h4>
            <p className="text-xs text-ink-500">{checked.size} selected</p>
          </div>
          {archived ? (
            <p className="text-sm text-ink-500">Restore this student to change their lessons.</p>
          ) : loadingLessons ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : lessonList.length === 0 ? (
            <p className="text-sm text-ink-500">No lessons yet. Create them on the Lessons page.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {lessonList.map((l) => {
                  const isOn = checked.has(l.id)
                  const isNew = isOn && !enrolledIds.has(l.id)
                  return (
                    <div key={l.id} className="flex items-center gap-3 rounded-md border border-sand-200 px-3 py-2">
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <input type="checkbox" checked={isOn} onChange={() => toggle(l.id)} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink-900 truncate">{l.name}</span>
                          <span className="block text-xs text-ink-500">
                            {DAY_NAMES[l.day_of_week]} · {formatTimeLabel(l.start_time)} – {formatTimeLabel(l.end_time)}
                            {l.fee_amount != null ? ` · RM ${Number(l.fee_amount).toFixed(2)}` : ''}
                          </span>
                        </span>
                      </label>
                      {isNew && l.fee_amount != null && (
                        <select
                          className="field-input text-xs py-1 w-36 shrink-0"
                          value={frequencies[l.id] || ''}
                          onChange={(e) => setFrequencies((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        >
                          <option value="">No invoice</option>
                          {RECURRENCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-ink-500 mt-2">
                Tick to enrol, untick to remove. Beside a newly ticked lesson you can start a recurring invoice at that lesson's fee.
              </p>
            </>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-sand-100">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
    {billingPrompt && (
      <BillingPromptModal
        items={billingPrompt}
        onDone={() => {
          setBillingPrompt(null)
          onSaved()
        }}
      />
    )}
    </>
  )
}

function StudentInvoicesModal({ student, initialUnpaidOnly, paymentMethods, onClose }) {
  const [invoices, setInvoices] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unpaidOnly, setUnpaidOnly] = useState(initialUnpaidOnly)
  const [payInvoice, setPayInvoice] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [{ data, error: loadError }, { data: orgRow }] = await Promise.all([
      supabase.from('student_invoices').select('*').eq('student_id', student.id).order('issue_date', { ascending: false }),
      supabase.from('organizations').select('*').eq('id', student.org_id).single(),
    ])
    if (loadError) setError(loadError.message)
    setInvoices(data || [])
    setOrg(orgRow)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  async function download(inv) {
    setDownloading(inv.id)
    try {
      await generateInvoicePdf(inv, org, student)
    } catch (err) {
      setError('Could not create the PDF. Please try again.')
    }
    setDownloading(null)
  }

  const shown = unpaidOnly ? invoices.filter((i) => i.status === 'unpaid' || i.status === 'partial') : invoices
  const outstanding = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Math.max(Number(i.amount) - Number(i.payment_amount || 0), 0), 0)

  const badge = (status) =>
    status === 'paid' ? (
      <span className="badge-approved">Paid</span>
    ) : status === 'partial' ? (
      <span className="badge-pending">Partial</span>
    ) : status === 'cancelled' ? (
      <span className="badge-cancelled">Cancelled</span>
    ) : (
      <span className="badge-pending">Unpaid</span>
    )

  return (
    <Modal title={`Invoices and payments — ${student.full_name}`} onClose={onClose} wide>
      {error && (
        <div className="mb-3">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-ink-700">
          Outstanding: <span className={outstanding > 0 ? 'font-semibold text-rose-600' : 'font-semibold text-ink-900'}>RM {outstanding.toFixed(2)}</span>
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
          <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} /> Unpaid only
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-500">{unpaidOnly ? 'No unpaid invoices.' : 'No invoices yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Period / issued</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Paid</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {shown.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-3 py-2 font-medium text-ink-900">INV-{String(inv.invoice_no).padStart(5, '0')}</td>
                  <td className="px-3 py-2 text-ink-700">
                    {inv.invoice_month || '—'}
                    <span className="block text-xs text-ink-500">{formatDate(inv.issue_date)}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-700">RM {Number(inv.amount).toFixed(2)}</td>
                  <td className="px-3 py-2 text-ink-700">RM {Number(inv.payment_amount || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{badge(inv.status)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {inv.status !== 'cancelled' && (
                        <button onClick={() => setPayInvoice(inv)} className="btn-primary text-xs">
                          {inv.status === 'paid' ? 'Receipts' : 'Pay'}
                        </button>
                      )}
                      <button
                        onClick={() => download(inv)}
                        disabled={downloading === inv.id}
                        className="btn-secondary text-xs"
                        title="Download invoice PDF"
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payInvoice && (
        <QuickPayModal
          invoice={payInvoice}
          students={[student]}
          paymentMethods={paymentMethods}
          onClose={() => setPayInvoice(null)}
          onSaved={load}
        />
      )}
    </Modal>
  )
}

const STATUS_STYLE = {
  present: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-rose-100 text-rose-800',
}
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function AttendanceCalendarModal({ student, onClose }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const first = toISODate(new Date(year, month, 1))
      const last = toISODate(new Date(year, month + 1, 0))
      const { data } = await supabase
        .from('student_attendance')
        .select('attendance_date, status, classes(name)')
        .eq('student_id', student.id)
        .gte('attendance_date', first)
        .lte('attendance_date', last)
      setRecords(data || [])
      setLoading(false)
    }
    load()
  }, [student.id, year, month])

  function shift(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const byDate = {}
  records.forEach((r) => {
    if (!byDate[r.attendance_date]) byDate[r.attendance_date] = []
    byDate[r.attendance_date].push(r)
  })
  const dayStatus = (list) => (list.some((r) => r.status === 'absent') ? 'absent' : list.some((r) => r.status === 'late') ? 'late' : 'present')
  const totals = { present: 0, late: 0, absent: 0 }
  records.forEach((r) => {
    if (totals[r.status] !== undefined) totals[r.status] += 1
  })
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

  return (
    <Modal title={`Attendance — ${student.full_name}`} onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="rounded p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900">
          <ChevronLeft size={18} />
        </button>
        <p className="font-medium text-ink-900">{monthLabel}</p>
        <button onClick={() => shift(1)} className="rounded p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-ink-500 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className={`space-y-1 ${loading ? 'opacity-50' : ''}`}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const iso = toISODate(date)
              const inMonth = date.getMonth() === month
              const list = byDate[iso]
              const style = list && inMonth ? STATUS_STYLE[dayStatus(list)] : inMonth ? 'text-ink-700' : 'text-ink-500/30'
              return (
                <div
                  key={iso}
                  title={list ? list.map((r) => `${r.classes?.name || 'Lesson'}: ${r.status}`).join('\n') : ''}
                  className={`h-10 rounded-md flex items-center justify-center text-xs font-medium ${style}`}
                >
                  {date.getDate()}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-ink-700">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> Present ({totals.present})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" /> Late ({totals.late})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-rose-100 border border-rose-300" /> Absent ({totals.absent})
        </span>
      </div>
      <p className="text-xs text-ink-500 mt-2">Days with no colour have no attendance recorded. Hover a day to see the lesson.</p>
    </Modal>
  )
}
