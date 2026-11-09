import { useEffect, useState } from 'react'
import { ClipboardList, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import DatePicker from '../components/DatePicker'
import { formatDate } from '../lib/helpers'

// classes.day_of_week uses 0 = Monday ... 6 = Sunday. JS Date#getDay() uses
// 0 = Sunday ... 6 = Saturday, so convert before comparing.
function todayAppDow() {
  const jsDay = new Date().getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function nowTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
}

const ORDINALS = ['1st', '2nd', '3rd']

// Present and Late both mean the student attended, so both use up a credit. Absent does not.
const usesUpCredit = (status) => status === 'present' || status === 'late'

function CreditCell({ balance, deduct }) {
  const after = balance - deduct
  const tone = after <= 0 ? 'text-rose-600' : after <= 2 ? 'text-amber-600' : 'text-emerald-700'
  return (
    <div>
      <span className={`font-medium ${tone}`}>
        {balance}
        {deduct !== 0 && <> → {after}</>}
      </span>
      {deduct > 0 && balance <= 0 && <span className="block text-[11px] text-rose-600">No credits left. This will go below 0.</span>}
      {deduct < 0 && <span className="block text-[11px] text-ink-500">Credit will be returned</span>}
    </div>
  )
}

export default function StudentAttendancePage() {
  const { profile, isAdmin } = useAuth()
  const [allClasses, setAllClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [session, setSession] = useState(1)
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(nowTimeStr())
  const [students, setStudents] = useState([])
  const [records, setRecords] = useState({}) // studentId -> { status, markedAt, markedByName }  (what's on screen)
  const [original, setOriginal] = useState({}) // the same, as last saved — so only real changes are written
  const [balances, setBalances] = useState({}) // studentId -> credits left (lessons that use credits)
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    if (profile) loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadClasses() {
    setLoading(true)
    const { data: classData } = await supabase
      .from('classes')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name')

    let filtered = classData || []
    if (!isAdmin) {
      const { data: teacherLinks } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile.id)
      const allowedIds = new Set((teacherLinks || []).map((t) => t.class_id))
      filtered = filtered.filter((c) => allowedIds.has(c.id))
    }

    setAllClasses(filtered)
    setLoading(false)
  }

  // Teachers can only mark attendance for today, and only for classes
  // actually scheduled today. Admins can pick any class, any date up to
  // today, and adjust the recorded time freely (for backdating).
  const visibleClasses = isAdmin ? allClasses : allClasses.filter((c) => c.day_of_week === todayAppDow())

  const selectedClass = allClasses.find((c) => c.id === classId)
  // Lesson settings come from migration 44. Without it the page behaves exactly as before.
  const sessionAware = Boolean(selectedClass) && 'attendance_marks_per_day' in selectedClass
  const marksPerDay = sessionAware ? selectedClass.attendance_marks_per_day || 1 : 1
  const usesCredits = Boolean(selectedClass?.uses_credits)
  const activeSession = marksPerDay > 1 ? Math.min(session, marksPerDay) : 1
  const sessionWord = marksPerDay > 1 ? ` (${ORDINALS[activeSession - 1]} attendance)` : ''

  useEffect(() => {
    if (!isAdmin) {
      setDate(todayStr())
      setTime(nowTimeStr())
    }
    if (visibleClasses.length > 0 && !visibleClasses.some((c) => c.id === classId)) {
      setClassId(visibleClasses[0].id)
    } else if (visibleClasses.length === 0) {
      setClassId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClasses, isAdmin])

  useEffect(() => {
    setSession(1)
  }, [classId])

  useEffect(() => {
    if (classId && date) loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, activeSession, selectedClass?.id])

  async function loadRoster() {
    setRosterLoading(true)
    setSavedMessage('')
    setError('')
    let attendanceQuery = supabase
      .from('student_attendance')
      .select('student_id, status, marked_at, profiles(full_name)')
      .eq('class_id', classId)
      .eq('attendance_date', date)
    if (sessionAware) attendanceQuery = attendanceQuery.eq('session_no', activeSession)

    const [{ data: enrollments }, { data: attendance }, { data: ledger }] = await Promise.all([
      supabase
        .from('class_enrollments')
        .select('students(id, full_name)')
        .eq('class_id', classId)
        .eq('org_id', profile.org_id),
      attendanceQuery,
      usesCredits
        ? supabase.from('student_credit_ledger').select('student_id, delta').eq('class_id', classId)
        : Promise.resolve({ data: [] }),
    ])
    const studentList = (enrollments || [])
      .map((e) => e.students)
      .filter(Boolean)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    setStudents(studentList)

    const recMap = {}
    ;(attendance || []).forEach((a) => {
      recMap[a.student_id] = { status: a.status, markedAt: a.marked_at, markedByName: a.profiles?.full_name }
    })
    setRecords(recMap)
    setOriginal(recMap)

    const bal = {}
    ;(ledger || []).forEach((l) => {
      bal[l.student_id] = (bal[l.student_id] || 0) + l.delta
    })
    setBalances(bal)
    setRosterLoading(false)
  }

  function currentMarkedAt() {
    if (!isAdmin) return new Date().toISOString()
    return new Date(`${date}T${time}:00`).toISOString()
  }

  function setStatus(studentId, status) {
    setSavedMessage('')
    setRecords((prev) => {
      const next = { ...prev }
      if (next[studentId]?.status === status) delete next[studentId] // clicking the active one clears back to Unmarked
      else next[studentId] = { status, markedAt: currentMarkedAt(), markedByName: profile.full_name }
      return next
    })
  }

  function markAllAttended() {
    setSavedMessage('')
    const markedAt = currentMarkedAt()
    setRecords(() => {
      const next = {}
      students.forEach((s) => {
        next[s.id] = { status: 'present', markedAt, markedByName: profile.full_name }
      })
      return next
    })
  }

  // Only the marks that were actually changed get written, so students who were already marked keep their
  // original time (and never lose or gain a credit again by accident).
  const changedIds = students
    .filter((s) => (records[s.id]?.status || null) !== (original[s.id]?.status || null))
    .map((s) => s.id)

  function creditChange(studentId) {
    return (usesUpCredit(records[studentId]?.status) ? 1 : 0) - (usesUpCredit(original[studentId]?.status) ? 1 : 0)
  }

  function switchSession(n) {
    if (n === activeSession) return
    if (changedIds.length > 0 && !confirm('You have unsaved changes. Switch anyway and discard them?')) return
    setSession(n)
  }

  async function handleSave() {
    setError('')
    setSavedMessage('')
    if (changedIds.length === 0) {
      setSavedMessage('No changes to save.')
      return
    }
    setSaving(true)

    const changed = new Set(changedIds)
    const markedAt = currentMarkedAt()
    const toUpsert = students
      .filter((s) => changed.has(s.id) && records[s.id]?.status)
      .map((s) => ({
        org_id: profile.org_id,
        class_id: classId,
        student_id: s.id,
        attendance_date: date,
        ...(sessionAware ? { session_no: activeSession } : {}),
        status: records[s.id].status,
        marked_by: profile.id,
        marked_at: markedAt,
      }))
    const toClear = students.filter((s) => changed.has(s.id) && !records[s.id]?.status).map((s) => s.id)

    const deducted = changedIds.filter((id) => creditChange(id) > 0).length
    const returned = changedIds.filter((id) => creditChange(id) < 0).length

    if (toUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('student_attendance')
        .upsert(toUpsert, { onConflict: sessionAware ? 'class_id,student_id,attendance_date,session_no' : 'class_id,student_id,attendance_date' })
      if (upsertError) {
        setSaving(false)
        setError(upsertError.message)
        return
      }
    }

    if (toClear.length > 0) {
      let deleteQuery = supabase.from('student_attendance').delete().eq('class_id', classId).eq('attendance_date', date).in('student_id', toClear)
      if (sessionAware) deleteQuery = deleteQuery.eq('session_no', activeSession)
      const { error: deleteError } = await deleteQuery
      if (deleteError) {
        setSaving(false)
        setError(deleteError.message)
        return
      }
    }

    setSaving(false)
    await loadRoster()
    let message = 'Attendance saved.'
    if (usesCredits) {
      const parts = []
      if (deducted > 0) parts.push(`${deducted} credit${deducted === 1 ? '' : 's'} deducted`)
      if (returned > 0) parts.push(`${returned} credit${returned === 1 ? '' : 's'} returned`)
      if (parts.length > 0) message += ` ${parts.join(', ')}.`
    }
    setSavedMessage(message)
  }

  const STATUS_OPTIONS = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'late', label: 'Late' },
  ]

  const markedCount = students.filter((s) => records[s.id]?.status).length
  const isComplete = students.length > 0 && markedCount === students.length

  return (
    <AppLayout title="Student Attendance" subtitle="Mark attendance for a lesson on a specific date.">
      <div className={`card p-5 mb-6 grid grid-cols-1 gap-4 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div>
          <label className="field-label">Lesson</label>
          <select
            className="field-input"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={visibleClasses.length === 0}
          >
            {visibleClasses.length === 0 && <option value="">No lessons available</option>}
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!isAdmin && (
            <p className="text-[11px] text-ink-500 mt-1">Only showing lessons scheduled for today.</p>
          )}
        </div>
        <div>
          <label className="field-label">Date</label>
          <DatePicker value={date} onChange={setDate} maxDate={todayStr()} disabled={!isAdmin} />
          {!isAdmin && <p className="text-[11px] text-ink-500 mt-1">Teachers can only mark today's attendance.</p>}
        </div>
        {isAdmin && (
          <div>
            <label className="field-label">Time</label>
            <input type="time" className="field-input" value={time} onChange={(e) => setTime(e.target.value)} />
            <p className="text-[11px] text-ink-500 mt-1">Recorded time for whatever you mark/save below.</p>
          </div>
        )}
      </div>

      {marksPerDay > 1 && classId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-700">This lesson has {marksPerDay} attendance marks a day. Marking:</span>
          {Array.from({ length: marksPerDay }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => switchSession(n)}
              className={activeSession === n ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
            >
              {ORDINALS[n - 1]} attendance
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      {savedMessage && (
        <div className="mb-4">
          <Alert tone="brand">{savedMessage}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : visibleClasses.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No lessons available"
          description={
            isAdmin
              ? 'Create a lesson first, under Student Management.'
              : "You have no lessons scheduled today, or you're not assigned to teach any."
          }
        />
      ) : rosterLoading ? (
        <p className="text-sm text-ink-500">Loading roster…</p>
      ) : students.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No students enrolled" description="Enroll students into this lesson first." />
      ) : (
        <>
          <div className={`mb-3 flex items-center justify-between rounded-md px-4 py-2 text-sm font-medium ${
            isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <span>
              {isComplete
                ? `All students marked for this session${sessionWord}.`
                : `${students.length - markedCount} of ${students.length} student(s) not yet marked${sessionWord}.`}
            </span>
            <button type="button" onClick={markAllAttended} className="btn-secondary text-xs">
              <CheckCheck size={14} /> Mark all attended
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  {usesCredits && <th className="px-5 py-3 font-medium">Credits left</th>}
                  <th className="px-5 py-3 font-medium">Marked by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {students.map((s) => {
                  const record = records[s.id]
                  const status = record?.status || null
                  return (
                    <tr key={s.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">{s.full_name}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {STATUS_OPTIONS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setStatus(s.id, o.value)}
                              className={status === o.value ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                            >
                              {o.label}
                            </button>
                          ))}
                          {!status && <span className="text-xs text-ink-400 ml-1">Unmarked</span>}
                        </div>
                      </td>
                      {usesCredits && (
                        <td className="px-5 py-3">
                          <CreditCell balance={balances[s.id] || 0} deduct={creditChange(s.id)} />
                        </td>
                      )}
                      <td className="px-5 py-3 text-xs text-ink-500">
                        {status && record?.markedByName ? (
                          <>
                            {record.markedByName}
                            {record.markedAt && <> · {formatDate(record.markedAt)} {formatTime(record.markedAt)}</>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {usesCredits && (
            <p className="text-xs text-ink-500 mt-2">
              This lesson uses credits: one credit is deducted for each student marked Present or Late when you save. Absent does not deduct.
            </p>
          )}
        </>
      )}

      {students.length > 0 && !rosterLoading && (
        <div className="mt-5">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      )}
    </AppLayout>
  )
}
