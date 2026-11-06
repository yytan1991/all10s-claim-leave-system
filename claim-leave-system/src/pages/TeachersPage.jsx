import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserCog, X, MoreVertical, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { MembersChecklist } from './ClassesPage'
import {
  DAY_NAMES,
  formatTimeLabel,
  formatDate,
  formatDateWithDay,
  formatTime,
  formatHours,
  netHoursWorked,
  getMonthGrid,
  toISODate,
} from '../lib/helpers'

export default function TeachersPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [lessons, setLessons] = useState({}) // teacherId -> [{ id, name }]
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [teachingOnly, setTeachingOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')

  const [editFor, setEditFor] = useState(null)
  const [scheduleFor, setScheduleFor] = useState(null)
  const [attendanceFor, setAttendanceFor] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: staffRows }, { data: linkRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('org_id', profile.org_id).order('full_name'),
      supabase.from('class_teachers').select('teacher_id, classes(id, name, day_of_week, start_time)').eq('org_id', profile.org_id),
    ])
    setStaff((staffRows || []).filter((s) => s.role !== 'superadmin'))
    const map = {}
    ;(linkRows || []).forEach((l) => {
      if (!l.classes) return
      if (!map[l.teacher_id]) map[l.teacher_id] = []
      map[l.teacher_id].push(l.classes)
    })
    Object.values(map).forEach((list) => list.sort((a, b) => a.day_of_week - b.day_of_week || String(a.start_time).localeCompare(String(b.start_time))))
    setLessons(map)
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  const archivedCount = staff.filter((s) => s.archived_at).length
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff
      .filter((s) => Boolean(s.archived_at) === showArchived)
      .filter((s) => !teachingOnly || (lessons[s.id] || []).length > 0)
      .filter((s) => {
        if (!q) return true
        return [s.full_name, s.phone, s.email].some((v) => (v || '').toLowerCase().includes(q))
      })
  }, [staff, lessons, search, teachingOnly, showArchived])

  async function archiveTeacher(t) {
    const taught = lessons[t.id] || []
    const ok = confirm(
      `Archive ${t.full_name}?\n\n` +
        `• They are hidden from this list (find them under "Show archived").\n` +
        (taught.length ? `• They are taken off the lessons they teach: ${taught.map((c) => c.name).join(', ')}.\n` : '') +
        `• Their staff account, attendance and leave records are NOT changed, and they can still sign in. To stop that, use Employees.`
    )
    if (!ok) return
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ archived_at: new Date().toISOString() }).eq('id', t.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await supabase.from('class_teachers').delete().eq('teacher_id', t.id)
    load()
  }

  async function restoreTeacher(t) {
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ archived_at: null }).eq('id', t.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  function menuItems(t) {
    const base = [
      { label: 'Edit details', onClick: () => setEditFor(t) },
      { label: 'View schedule', onClick: () => setScheduleFor(t) },
      { label: 'View attendance', onClick: () => setAttendanceFor(t) },
    ]
    if (t.archived_at) return [...base, { label: 'Restore teacher', onClick: () => restoreTeacher(t), tone: 'brand' }]
    // Nobody can archive their own account from here.
    if (t.id === profile.id) return base
    return [...base, { label: 'Archive', onClick: () => archiveTeacher(t), tone: 'danger' }]
  }

  return (
    <AppLayout title="Teachers" subtitle="Your teaching staff and the lessons they teach. Use the ⋮ menu on a row for details, schedule and attendance.">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="field-input pl-9" placeholder="Search name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
          <input type="checkbox" checked={teachingOnly} onChange={(e) => setTeachingOnly(e.target.checked)} />
          Only staff with lessons
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
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
            icon={UserCog}
            title={showArchived ? 'No archived teachers' : search || teachingOnly ? 'No one matches' : 'No staff yet'}
            description={showArchived ? 'Archived teachers appear here.' : 'Add staff on the Employees page.'}
          />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium w-[26%]">Teacher</th>
                <th className="px-4 py-3 font-medium w-[20%]">Phone number</th>
                <th className="px-4 py-3 font-medium w-[46%]">Enrolled lessons</th>
                <th className="px-4 py-3 font-medium w-[8%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {visible.map((t) => {
                const taught = lessons[t.id] || []
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 break-words">{t.full_name}</p>
                      {t.email && <p className="text-xs text-ink-500 break-all">{t.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{t.phone || '—'}</td>
                    <td className="px-4 py-3">
                      {taught.length === 0 ? (
                        <span className="text-ink-500">—</span>
                      ) : (
                        taught.map((c) => (
                          <span key={c.id} className="inline-block rounded-full bg-sand-100 text-ink-700 text-xs px-2 py-0.5 mr-1 mb-1">
                            {c.name}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu items={menuItems(t)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editFor && (
        <EditTeacherModal
          teacher={editFor}
          orgId={profile.org_id}
          adminId={profile.id}
          assignedIds={new Set((lessons[editFor.id] || []).map((c) => c.id))}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null)
            load()
          }}
        />
      )}
      {scheduleFor && (
        <ScheduleModal
          teacher={scheduleFor}
          classIds={(lessons[scheduleFor.id] || []).map((c) => c.id)}
          orgId={profile.org_id}
          adminId={profile.id}
          onChanged={load}
          onClose={() => setScheduleFor(null)}
        />
      )}
      {attendanceFor && <TeacherAttendanceModal teacher={attendanceFor} onClose={() => setAttendanceFor(null)} />}
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
      setPos({ top: upward ? rect.top - menuHeight : rect.bottom + 4, left: Math.max(8, rect.right - 208) })
    }
    setOpen((o) => !o)
  }

  const tone = { brand: 'text-brand-700 hover:bg-sand-50', danger: 'text-rose-600 hover:bg-rose-50' }

  return (
    <div className="inline-block text-left">
      <button ref={btnRef} onClick={toggle} className="text-ink-500 hover:text-ink-900 p-1" aria-label="Teacher actions">
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

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
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

function EditTeacherModal({ teacher, orgId, adminId, assignedIds, onClose, onSaved }) {
  const [fullName, setFullName] = useState(teacher.full_name || '')
  const [phone, setPhone] = useState(teacher.phone || '')
  const [classes, setClasses] = useState([])
  const [checked, setChecked] = useState(new Set(assignedIds))
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('classes')
      .select('*')
      .eq('org_id', orgId)
      .order('day_of_week')
      .order('start_time')
      .then(({ data }) => {
        setClasses(data || [])
        setLoadingClasses(false)
      })
  }, [orgId])

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
      setError("Enter the teacher's name.")
      return
    }
    setSaving(true)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq('id', teacher.id)
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    const toAssign = [...checked].filter((id) => !assignedIds.has(id))
    const toRemove = [...assignedIds].filter((id) => !checked.has(id))

    if (toAssign.length > 0) {
      const { error: assignError } = await supabase
        .from('class_teachers')
        .insert(toAssign.map((classId) => ({ org_id: orgId, class_id: classId, teacher_id: teacher.id, created_by: adminId })))
      if (assignError) {
        setSaving(false)
        setError(assignError.message)
        return
      }
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('class_teachers').delete().eq('teacher_id', teacher.id).in('class_id', toRemove)
      if (removeError) {
        setSaving(false)
        setError(removeError.message)
        return
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal title="Edit teacher" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        {teacher.archived_at && <Alert tone="amber">This teacher is archived (since {formatDate(teacher.archived_at.slice(0, 10))}).</Alert>}
        <div>
          <label className="field-label">Name</label>
          <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Phone number</label>
          <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-345 6789" />
        </div>
        <div>
          <label className="field-label">Email (sign-in)</label>
          <div className="rounded-md bg-sand-50 px-3 py-2 text-sm text-ink-700 break-all">{teacher.email || '—'}</div>
          <p className="text-xs text-ink-500 mt-1">The sign-in email can't be changed here.</p>
        </div>

        <div>
          <label className="field-label">Lessons this teacher teaches</label>
          <div className="border border-sand-200 rounded-md max-h-56 overflow-y-auto divide-y divide-sand-100">
            {loadingClasses ? (
              <p className="px-3 py-3 text-sm text-ink-500">Loading…</p>
            ) : classes.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink-500">No classes yet. Create them on the Classes page.</p>
            ) : (
              classes.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-sand-50 cursor-pointer">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{c.name}</p>
                    <p className="text-xs text-ink-500">
                      {DAY_NAMES[c.day_of_week]} · {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                      {c.room ? ` · ${c.room}` : ''}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-ink-500 mt-1">A class can have more than one teacher.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function minutesOf(t) {
  if (!t) return 0
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

function ScheduleModal({ teacher, classIds, orgId, adminId, onChanged, onClose }) {
  const [classes, setClasses] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(classIds.length > 0)
  const [openLesson, setOpenLesson] = useState(null)

  async function loadCounts() {
    if (classIds.length === 0) return
    const { data } = await supabase.from('class_enrollments').select('class_id').in('class_id', classIds)
    const map = {}
    ;(data || []).forEach((e) => {
      map[e.class_id] = (map[e.class_id] || 0) + 1
    })
    setCounts(map)
  }

  useEffect(() => {
    if (classIds.length === 0) return
    supabase
      .from('classes')
      .select('*')
      .in('id', classIds)
      .order('day_of_week')
      .order('start_time')
      .then(({ data }) => {
        setClasses(data || [])
        setLoading(false)
      })
    loadCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byDay = {}
  classes.forEach((c) => {
    if (!byDay[c.day_of_week]) byDay[c.day_of_week] = []
    byDay[c.day_of_week].push(c)
  })
  const totalMinutes = classes.reduce((s, c) => s + Math.max(minutesOf(c.end_time) - minutesOf(c.start_time), 0), 0)

  return (
    <>
      <Modal title={`Schedule — ${teacher.full_name}`} onClose={onClose}>
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-ink-500">No lessons assigned. Use Edit details to assign classes.</p>
        ) : (
          <>
            <p className="text-sm text-ink-700 mb-1">
              {classes.length} lesson{classes.length === 1 ? '' : 's'} a week · about {(totalMinutes / 60).toFixed(1)} teaching hours
            </p>
            <p className="text-xs text-ink-500 mb-4">Click a lesson to see its details and edit its students.</p>
            <div className="space-y-4">
              {Object.keys(byDay)
                .map(Number)
                .sort((a, b) => a - b)
                .map((day) => (
                  <div key={day}>
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-1.5">{DAY_NAMES[day]}</p>
                    <div className="space-y-2">
                      {byDay[day].map((c) => (
                        <div key={c.id} className="rounded-md border border-sand-200 px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <button onClick={() => setOpenLesson(c)} className="text-sm font-medium text-brand-700 hover:underline text-left">
                              {c.name}
                            </button>
                            <p className="text-xs text-ink-500">
                              {counts[c.id] || 0} student{(counts[c.id] || 0) === 1 ? '' : 's'}
                              {c.room ? ` · ${c.room}` : ''}
                            </p>
                          </div>
                          <p className="text-sm text-ink-700 shrink-0">
                            {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </Modal>

      {openLesson && (
        <LessonModal
          lesson={openLesson}
          orgId={orgId}
          adminId={adminId}
          onChanged={() => {
            loadCounts()
            onChanged()
          }}
          onClose={() => setOpenLesson(null)}
        />
      )}
    </>
  )
}

// One lesson: its details (read-only) and its student list (editable — the same editor as Classes → Edit → Students).
function LessonModal({ lesson, orgId, adminId, onChanged, onClose }) {
  const [teacherNames, setTeacherNames] = useState([])
  const [studentCount, setStudentCount] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('class_teachers').select('profiles!class_teachers_teacher_id_fkey(full_name)').eq('class_id', lesson.id),
      supabase.from('class_enrollments').select('*', { count: 'exact', head: true }).eq('class_id', lesson.id),
    ]).then(([{ data: t }, { count }]) => {
      setTeacherNames((t || []).map((x) => x.profiles?.full_name).filter(Boolean))
      setStudentCount(count ?? 0)
    })
  }, [lesson.id])

  const detail = (label, value) => (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-sm text-ink-900">{value}</p>
    </div>
  )

  return (
    <Modal title={lesson.name} onClose={onClose} wide>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-md bg-sand-50 p-4 mb-5">
        {detail('Day', DAY_NAMES[lesson.day_of_week])}
        {detail('Time', `${formatTimeLabel(lesson.start_time)} – ${formatTimeLabel(lesson.end_time)}`)}
        {detail('Room', lesson.room || '—')}
        {detail('Fee', lesson.fee_amount != null ? `RM ${Number(lesson.fee_amount).toFixed(2)}` : '—')}
        {detail('Teachers', teacherNames.length ? teacherNames.join(', ') : '—')}
        {detail('Students enrolled', studentCount === null ? '…' : studentCount)}
      </div>

      <h4 className="text-sm font-semibold text-ink-900 mb-2">Students — tick to enrol, untick to remove</h4>
      <MembersChecklist
        orgId={orgId}
        createdBy={adminId}
        classItem={lesson}
        mode="students"
        onSaved={() => {
          onChanged()
          onClose()
        }}
        onClose={onClose}
      />
      <p className="text-xs text-ink-500 mt-3">To change the lesson's day, time, room or fee, use Classes → Edit.</p>
    </Modal>
  )
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// The teacher's own clock-in record (the same data as the Attendance Log), month by month,
// with approved leave days marked.
function TeacherAttendanceModal({ teacher, onClose }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [records, setRecords] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const first = toISODate(new Date(year, month, 1))
      const last = toISODate(new Date(year, month + 1, 0))
      const [{ data: recs }, { data: leaveRows }] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('*, work_locations(name)')
          .eq('profile_id', teacher.id)
          .gte('date', first)
          .lte('date', last)
          .order('date'),
        supabase
          .from('leave_applications')
          .select('start_date, end_date, leave_types(name)')
          .eq('profile_id', teacher.id)
          .eq('status', 'approved')
          .lte('start_date', last)
          .gte('end_date', first),
      ])
      setRecords(recs || [])
      setLeaves(leaveRows || [])
      setLoading(false)
    }
    load()
  }, [teacher.id, year, month])

  function shift(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const byDate = {}
  records.forEach((r) => {
    byDate[r.date] = r
  })
  const leaveByDate = {}
  leaves.forEach((l) => {
    const cur = new Date(`${l.start_date}T00:00:00`)
    const end = new Date(`${l.end_date}T00:00:00`)
    while (cur <= end) {
      leaveByDate[toISODate(cur)] = l.leave_types?.name || 'Leave'
      cur.setDate(cur.getDate() + 1)
    }
  })

  const present = records.filter((r) => r.clock_in_at).length
  const late = records.filter((r) => r.is_late).length
  const hours = records.reduce((s, r) => s + (netHoursWorked(r) || 0), 0)
  const leaveDays = Object.keys(leaveByDate).filter((d) => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

  return (
    <Modal title={`Attendance — ${teacher.full_name}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="rounded p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900">
          <ChevronLeft size={18} />
        </button>
        <p className="font-medium text-ink-900">{monthLabel}</p>
        <button onClick={() => shift(1)} className="rounded p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          ['Days present', present],
          ['Days late', late],
          ['Leave days', leaveDays],
          ['Hours worked', formatHours(hours)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md bg-sand-50 px-3 py-2">
            <p className="text-lg font-semibold text-ink-900">{value}</p>
            <p className="text-xs text-ink-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 mb-1 max-w-md">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-ink-500 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className={`space-y-1 max-w-md ${loading ? 'opacity-50' : ''}`}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const iso = toISODate(date)
              const inMonth = date.getMonth() === month
              const rec = byDate[iso]
              const leaveName = leaveByDate[iso]
              let style = inMonth ? 'text-ink-700' : 'text-ink-500/30'
              let tip = ''
              if (inMonth && rec?.clock_in_at) {
                style = rec.is_late ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                tip = `In ${formatTime(rec.clock_in_at)}${rec.clock_out_at ? `, out ${formatTime(rec.clock_out_at)}` : ''}${rec.is_late ? ' (late)' : ''}`
              } else if (inMonth && leaveName) {
                style = 'bg-sky-100 text-sky-800'
                tip = leaveName
              }
              return (
                <div key={iso} title={tip} className={`h-9 rounded-md flex items-center justify-center text-xs font-medium ${style}`}>
                  {date.getDate()}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-ink-700">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> On time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" /> Late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-sky-100 border border-sky-300" /> Approved leave
        </span>
      </div>

      {records.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Out</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-ink-900">{formatDateWithDay(r.date)}</td>
                  <td className={`px-3 py-2 ${r.is_late ? 'text-rose-600 font-medium' : 'text-ink-700'}`}>
                    {r.clock_in_at ? formatTime(r.clock_in_at) : '—'}
                    {r.is_late && <span className="ml-1 text-xs">(late)</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{r.clock_out_at ? formatTime(r.clock_out_at) : '—'}</td>
                  <td className="px-3 py-2 text-ink-700">{formatHours(netHoursWorked(r))}</td>
                  <td className="px-3 py-2 text-ink-500">{r.work_locations?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-500 mt-3">This is the teacher's own clock-in record. Days with no colour have no record.</p>
    </Modal>
  )
}
