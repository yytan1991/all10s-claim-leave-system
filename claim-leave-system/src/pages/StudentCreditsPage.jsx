import { useEffect, useMemo, useState } from 'react'
import { Coins, X, History } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

// "30 October 2026, 2:00 PM"
function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
  return `${date}, ${time}`
}
function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
}

function CreditPill({ balance }) {
  const tone = balance <= 0 ? 'bg-rose-100 text-rose-800' : balance <= 2 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
  return <span className={`inline-block min-w-[2.5rem] text-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{balance}</span>
}

export default function StudentCreditsPage() {
  const { profile, isAdmin } = useAuth()
  const [lessons, setLessons] = useState([])
  const [lessonId, setLessonId] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [error, setError] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [adjust, setAdjust] = useState(null) // { mode: 'add' | 'deduct', student }
  const [historyFor, setHistoryFor] = useState(null)

  const lesson = lessons.find((l) => l.id === lessonId)

  useEffect(() => {
    if (profile) loadLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadLessons() {
    setLoading(true)
    setError('')
    const { data, error: lessonError } = await supabase
      .from('classes')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('uses_credits', true)
      .order('name')
    if (lessonError) {
      setError(lessonError.message)
      setLoading(false)
      return
    }
    let list = data || []
    if (!isAdmin) {
      const { data: links } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile.id)
      const allowed = new Set((links || []).map((l) => l.class_id))
      list = list.filter((l) => allowed.has(l.id))
    }
    setLessons(list)
    setLessonId((prev) => (list.some((l) => l.id === prev) ? prev : list[0]?.id || ''))
    setLoading(false)
  }

  useEffect(() => {
    if (lessonId) loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  async function loadRows() {
    setRowsLoading(true)
    const [{ data: enrolments }, { data: ledger }] = await Promise.all([
      supabase.from('class_enrollments').select('students(id, full_name)').eq('class_id', lessonId).eq('org_id', profile.org_id),
      supabase.from('student_credit_ledger').select('student_id, delta, kind, occurred_at, students(full_name)').eq('class_id', lessonId),
    ])
    const map = {}
    ;(enrolments || []).forEach((e) => {
      if (e.students) map[e.students.id] = { id: e.students.id, name: e.students.full_name, enrolled: true, balance: 0, used: 0, lastAttended: null }
    })
    ;(ledger || []).forEach((l) => {
      if (!map[l.student_id]) map[l.student_id] = { id: l.student_id, name: l.students?.full_name || 'Student', enrolled: false, balance: 0, used: 0, lastAttended: null }
      const m = map[l.student_id]
      m.balance += l.delta
      if (l.kind === 'attendance') {
        m.used += 1
        if (!m.lastAttended || l.occurred_at > m.lastAttended) m.lastAttended = l.occurred_at
      }
      if (l.kind === 'attendance_undo') m.used -= 1
    })
    setRows(Object.values(map).sort((a, b) => a.name.localeCompare(b.name)))
    setRowsLoading(false)
  }

  const enrolled = rows.filter((r) => r.enrolled)
  const lowCount = enrolled.filter((r) => r.balance >= 1 && r.balance <= 2).length
  const outCount = enrolled.filter((r) => r.balance <= 0).length
  const shown = useMemo(() => (lowOnly ? rows.filter((r) => r.balance <= 2) : rows), [rows, lowOnly])

  return (
    <AppLayout title="Lesson Credits" subtitle="How many credits each student has left in lessons that use credits.">
      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={Coins}
          title={isAdmin ? 'No lessons use credits yet' : 'None of your lessons use credits'}
          description={isAdmin ? 'Open Lessons, click Edit on a lesson, and tick "This lesson uses credits".' : 'Ask the admin if a lesson of yours should use credits.'}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 mb-5">
            <div className="w-full sm:w-72">
              <label className="field-label">Lesson</label>
              <select className="field-input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer pb-2">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              Only students with 2 or fewer credits
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
            {[
              ['Students', enrolled.length, 'text-ink-900'],
              ['Running low (1–2)', lowCount, 'text-amber-600'],
              ['Out of credits', outCount, 'text-rose-600'],
            ].map(([label, value, tone]) => (
              <div key={label} className="card px-4 py-3">
                <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
                <p className="text-xs text-ink-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            {rowsLoading ? (
              <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">{lowOnly ? 'No one is running low.' : 'No students are enrolled in this lesson yet.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Student</th>
                      <th className="px-5 py-3 font-medium">Credits left</th>
                      <th className="px-5 py-3 font-medium">Used</th>
                      <th className="px-5 py-3 font-medium">Last attended</th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-ink-900">{r.name}</p>
                          {!r.enrolled && <p className="text-xs text-ink-500">No longer enrolled</p>}
                        </td>
                        <td className="px-5 py-3">
                          <CreditPill balance={r.balance} />
                        </td>
                        <td className="px-5 py-3 text-ink-700">{r.used}</td>
                        <td className="px-5 py-3 text-ink-700">{r.lastAttended ? fmtDateTime(r.lastAttended) : '—'}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap space-x-3">
                          {isAdmin && (
                            <>
                              <button onClick={() => setAdjust({ mode: 'add', student: r })} className="text-brand-600 hover:underline text-xs font-medium">
                                Add credits
                              </button>
                              <button onClick={() => setAdjust({ mode: 'deduct', student: r })} className="text-rose-600 hover:underline text-xs font-medium">
                                Deduct
                              </button>
                            </>
                          )}
                          <button onClick={() => setHistoryFor(r)} className="inline-flex items-center gap-1 text-ink-700 hover:underline text-xs font-medium">
                            <History size={13} /> History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-500 mt-3">
            {isAdmin
              ? 'Credits are deducted automatically when a student is marked Present or Late. Use Add credits when a package is paid for, and Deduct to correct a mistake.'
              : 'Credits are deducted automatically when you mark a student Present or Late. Ask the admin to add or correct credits.'}
          </p>
        </>
      )}

      {adjust && (
        <AdjustModal
          mode={adjust.mode}
          student={adjust.student}
          lesson={lesson}
          orgId={profile.org_id}
          adminId={profile.id}
          onClose={() => setAdjust(null)}
          onSaved={() => {
            setAdjust(null)
            loadRows()
          }}
        />
      )}
      {historyFor && <HistoryModal student={historyFor} lesson={lesson} onClose={() => setHistoryFor(null)} />}
    </AppLayout>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
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

function AdjustModal({ mode, student, lesson, orgId, adminId, onClose, onSaved }) {
  const isAdd = mode === 'add'
  const [amount, setAmount] = useState(isAdd ? String(lesson?.credits_per_package || 12) : '1')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = Math.floor(Number(amount)) || 0
  const after = student.balance + (isAdd ? n : -n)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!(Number(amount) >= 1) || !Number.isInteger(Number(amount))) {
      setError('Enter a whole number of credits (1 or more).')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('student_credit_ledger').insert({
      org_id: orgId,
      class_id: lesson.id,
      student_id: student.id,
      delta: isAdd ? n : -n,
      kind: isAdd ? 'manual_add' : 'manual_deduct',
      occurred_at: new Date().toISOString(),
      note: note.trim() || null,
      created_by: adminId,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title={`${isAdd ? 'Add credits' : 'Deduct credits'} — ${student.name}`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <p className="text-sm text-ink-500">{lesson?.name}</p>
        <div>
          <label className="field-label">{isAdd ? 'Credits to add' : 'Credits to deduct'}</label>
          <input type="number" min="1" step="1" className="field-input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input
            className="field-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isAdd ? 'e.g. Paid for a 12-lesson package' : 'e.g. Marked by mistake'}
          />
          <p className="text-xs text-ink-500 mt-1">Only staff can see notes.</p>
        </div>
        <div className="rounded-md bg-sand-50 px-3 py-2 text-sm text-ink-700">
          Credits now: <strong>{student.balance}</strong> → after: <strong>{n >= 1 ? after : student.balance}</strong>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className={isAdd ? 'btn-primary' : 'btn-primary'}>
            {saving ? 'Saving…' : isAdd ? 'Add credits' : 'Deduct credits'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({ student, lesson, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('student_credit_ledger')
      .select('*, profiles(full_name)')
      .eq('class_id', lesson.id)
      .eq('student_id', student.id)
      .order('occurred_at')
      .order('created_at')
      .then(({ data }) => {
        let running = 0
        const withBalance = (data || []).map((e) => {
          running += e.delta
          return { ...e, balanceAfter: running }
        })
        setEntries(withBalance.reverse()) // newest first
        setLoading(false)
      })
  }, [lesson.id, student.id])

  const twice = lesson?.attendance_marks_per_day === 2
  function eventLabel(e) {
    if (e.kind === 'attendance') {
      const session = twice ? ` · ${e.session_no === 2 ? '2nd' : '1st'} attendance` : ''
      return `Attended class${e.attendance_date ? ` on ${fmtDate(e.attendance_date)}` : ''}${session}`
    }
    if (e.kind === 'attendance_undo') return `Credit returned${e.note ? ` (${e.note.toLowerCase()})` : ''}`
    if (e.kind === 'manual_add') return 'Credits added'
    return 'Credits deducted'
  }

  return (
    <Modal title={`Credit history — ${student.name}`} onClose={onClose} wide>
      <p className="text-sm text-ink-500 mb-4">
        {lesson?.name} · <strong className="text-ink-900">{student.balance}</strong> credit{student.balance === 1 ? '' : 's'} left
      </p>
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-500">No credit activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date and time</th>
                <th className="px-3 py-2 font-medium">What happened</th>
                <th className="px-3 py-2 font-medium">Credits</th>
                <th className="px-3 py-2 font-medium">Left after</th>
                <th className="px-3 py-2 font-medium">By / note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-ink-900 whitespace-nowrap">{fmtDateTime(e.occurred_at)}</td>
                  <td className="px-3 py-2 text-ink-700">{eventLabel(e)}</td>
                  <td className={`px-3 py-2 font-medium ${e.delta > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</td>
                  <td className="px-3 py-2 text-ink-700">{e.balanceAfter}</td>
                  <td className="px-3 py-2 text-xs text-ink-500">
                    {e.profiles?.full_name || ''}
                    {e.note && e.kind.startsWith('manual') ? `${e.profiles?.full_name ? ' · ' : ''}${e.note}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
