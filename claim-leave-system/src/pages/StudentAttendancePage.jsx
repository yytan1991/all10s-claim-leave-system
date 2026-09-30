import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

export default function StudentAttendancePage() {
  const { profile, isAdmin } = useAuth()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [students, setStudents] = useState([])
  const [records, setRecords] = useState({})
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

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

    setClasses(filtered)
    if (filtered.length > 0) setClassId((prev) => prev || filtered[0].id)
    setLoading(false)
  }

  useEffect(() => {
    if (classId && date) loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date])

  async function loadRoster() {
    setRosterLoading(true)
    setSaved(false)
    setError('')
    const [{ data: enrollments }, { data: attendance }] = await Promise.all([
      supabase
        .from('class_enrollments')
        .select('students(id, full_name)')
        .eq('class_id', classId)
        .eq('org_id', profile.org_id),
      supabase
        .from('student_attendance')
        .select('student_id, status')
        .eq('class_id', classId)
        .eq('attendance_date', date),
    ])
    const studentList = (enrollments || [])
      .map((e) => e.students)
      .filter(Boolean)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    setStudents(studentList)

    const recMap = {}
    ;(attendance || []).forEach((a) => {
      recMap[a.student_id] = a.status
    })
    setRecords(recMap)
    setRosterLoading(false)
  }

  function setStatus(studentId, status) {
    setRecords((prev) => {
      const next = { ...prev }
      if (next[studentId] === status) delete next[studentId] // clicking the active one clears back to Unmarked
      else next[studentId] = status
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)

    const toUpsert = students
      .filter((s) => records[s.id])
      .map((s) => ({
        org_id: profile.org_id,
        class_id: classId,
        student_id: s.id,
        attendance_date: date,
        status: records[s.id],
        marked_by: profile.id,
      }))
    const toClear = students.filter((s) => !records[s.id]).map((s) => s.id)

    if (toUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('student_attendance')
        .upsert(toUpsert, { onConflict: 'class_id,student_id,attendance_date' })
      if (upsertError) {
        setSaving(false)
        setError(upsertError.message)
        return
      }
    }

    if (toClear.length > 0) {
      const { error: deleteError } = await supabase
        .from('student_attendance')
        .delete()
        .eq('class_id', classId)
        .eq('attendance_date', date)
        .in('student_id', toClear)
      if (deleteError) {
        setSaving(false)
        setError(deleteError.message)
        return
      }
    }

    setSaving(false)
    setSaved(true)
  }

  const STATUS_OPTIONS = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'late', label: 'Late' },
  ]

  return (
    <AppLayout title="Student Attendance" subtitle="Mark attendance for a class on a specific date.">
      <div className="card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Class</label>
          <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={classes.length === 0}>
            {classes.length === 0 && <option value="">No classes available</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      {saved && (
        <div className="mb-4">
          <Alert tone="brand">Attendance saved.</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No classes available"
          description={isAdmin ? 'Create a class first, under Student Management.' : "You're not assigned to teach any classes yet."}
        />
      ) : rosterLoading ? (
        <p className="text-sm text-ink-500">Loading roster…</p>
      ) : students.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No students enrolled" description="Enroll students into this class first." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {students.map((s) => {
                const status = records[s.id] || null
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
