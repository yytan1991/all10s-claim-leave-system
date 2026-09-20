import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Users2, School, CalendarClock, UserCog, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatTimeLabel(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export default function ClassesAdmin() {
  const [tab, setTab] = useState('classes')

  return (
    <AppLayout title="Classes" subtitle="Weekly class schedule and student/teacher assignment.">
      <div className="mb-6 flex gap-2 border-b border-sand-200 flex-wrap">
        {[
          { key: 'classes', label: 'Classes' },
          { key: 'students', label: 'Students' },
          { key: 'byteacher', label: 'By Teacher' },
        ].map((t) => (
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

      {tab === 'classes' && <ClassesTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'byteacher' && <ByTeacherTab />}
    </AppLayout>
  )
}

// =========================================================
// Students (minimal — full profile comes in a later phase)
// =========================================================
function StudentsTab() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('students').select('*').eq('org_id', profile.org_id).order('full_name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function removeStudent(id) {
    if (!confirm('Remove this student? This also removes their class enrollments.')) return
    await supabase.from('students').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setAdding(true)} className="btn-primary text-sm">
          <Plus size={15} /> Add student
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users2} title="No students yet" description="Add your first student above." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Parent</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-ink-900">{r.full_name}</td>
                  <td className="px-5 py-3 text-ink-700">{r.parent_name || '—'}</td>
                  <td className="px-5 py-3 text-ink-700">{r.parent_contact || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => removeStudent(r.id)} className="text-rose-500 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
  )
}

function AddStudentModal({ orgId, createdBy, onClose, onSaved }) {
  const [fullName, setFullName] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentContact, setParentContact] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) {
      setError('Enter the student\'s name.')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('students').insert({
      org_id: orgId,
      full_name: fullName.trim(),
      parent_name: parentName || null,
      parent_contact: parentContact || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Add student</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-500 mb-4">
          A quick record for now — full student profiles and parent self-registration are coming
          in a later phase.
        </p>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}
          <div>
            <label className="field-label">Student name</label>
            <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Parent name (optional)</label>
            <input className="field-input" value={parentName} onChange={(e) => setParentName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Parent contact (optional)</label>
            <input
              className="field-input"
              value={parentContact}
              onChange={(e) => setParentContact(e.target.value)}
              placeholder="012-345 6789"
            />
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
      </div>
    </div>
  )
}

// =========================================================
// Classes
// =========================================================
function ClassesTab() {
  const { profile } = useAuth()
  const [classes, setClasses] = useState([])
  const [studentCounts, setStudentCounts] = useState({})
  const [teacherNames, setTeacherNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingClass, setEditingClass] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: classData }, { data: enrollData }, { data: teacherLinkData }] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('day_of_week')
        .order('start_time'),
      supabase.from('class_enrollments').select('class_id').eq('org_id', profile.org_id),
      supabase.from('class_teachers').select('class_id, profiles(full_name)').eq('org_id', profile.org_id),
    ])
    setClasses(classData || [])

    const sCounts = {}
    ;(enrollData || []).forEach((e) => {
      sCounts[e.class_id] = (sCounts[e.class_id] || 0) + 1
    })
    setStudentCounts(sCounts)

    const tNames = {}
    ;(teacherLinkData || []).forEach((t) => {
      if (!tNames[t.class_id]) tNames[t.class_id] = []
      tNames[t.class_id].push(t.profiles?.full_name)
    })
    setTeacherNames(tNames)

    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function deleteClass(id) {
    if (!confirm('Delete this class? This also removes all its student and teacher assignments.')) return
    await supabase.from('classes').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="btn-primary text-sm">
          <Plus size={15} /> New class
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : classes.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No classes yet" description="Create your first class above." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Day &amp; time</th>
                  <th className="px-5 py-3 font-medium">Teachers</th>
                  <th className="px-5 py-3 font-medium">Room</th>
                  <th className="px-5 py-3 font-medium">Students</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{c.name}</td>
                    <td className="px-5 py-3 text-ink-700">
                      {DAY_NAMES[c.day_of_week]} · {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                    </td>
                    <td className="px-5 py-3 text-ink-700">
                      {teacherNames[c.id]?.length ? teacherNames[c.id].join(', ') : '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-500">{c.room || '—'}</td>
                    <td className="px-5 py-3 text-ink-700">{studentCounts[c.id] || 0}</td>
                    <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => setEditingClass(c)}
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs font-medium"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button onClick={() => deleteClass(c.id)} className="text-rose-500 hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <CreateClassModal
          orgId={profile.org_id}
          createdBy={profile.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            load()
          }}
        />
      )}

      {editingClass && (
        <EditClassModal
          orgId={profile.org_id}
          createdBy={profile.id}
          classItem={editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={() => {
            setEditingClass(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CreateClassModal({ orgId, createdBy, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('16:00')
  const [room, setRoom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !startTime || !endTime) {
      setError('Fill in a class name, start time, and end time.')
      return
    }
    if (endTime <= startTime) {
      setError('End time must be after start time.')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('classes').insert({
      org_id: orgId,
      name: name.trim(),
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">New class</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-500 mb-4">Add teachers and students afterward using "Edit".</p>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}
          <div>
            <label className="field-label">Class name</label>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard 1 Maths"
            />
          </div>
          <div>
            <label className="field-label">Day of week</label>
            <select className="field-input" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Start time</label>
              <input
                type="time"
                className="field-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">End time</label>
              <input type="time" className="field-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Room (optional)</label>
            <input className="field-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 2" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create class'}
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

// One combined "Edit" popup: class details at the top, then a Students/Teachers
// tab switcher below for bulk tick-to-add / untick-to-remove.
function EditClassModal({ orgId, createdBy, classItem, onClose, onSaved }) {
  const [subTab, setSubTab] = useState('students')
  const [name, setName] = useState(classItem.name)
  const [dayOfWeek, setDayOfWeek] = useState(classItem.day_of_week)
  const [startTime, setStartTime] = useState(classItem.start_time?.slice(0, 5) || '')
  const [endTime, setEndTime] = useState(classItem.end_time?.slice(0, 5) || '')
  const [room, setRoom] = useState(classItem.room || '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsSaved, setDetailsSaved] = useState(false)

  async function handleSaveDetails(e) {
    e.preventDefault()
    setDetailsError('')
    setDetailsSaved(false)
    if (!name.trim() || !startTime || !endTime) {
      setDetailsError('Fill in a class name, start time, and end time.')
      return
    }
    if (endTime <= startTime) {
      setDetailsError('End time must be after start time.')
      return
    }
    setSavingDetails(true)
    const { error: updateError } = await supabase
      .from('classes')
      .update({
        name: name.trim(),
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        room: room || null,
      })
      .eq('id', classItem.id)
    setSavingDetails(false)
    if (updateError) {
      setDetailsError(updateError.message)
      return
    }
    setDetailsSaved(true)
    // Keep the local copy in sync so the header stays correct if reopened
    // without a full page reload.
    classItem.name = name.trim()
    classItem.day_of_week = Number(dayOfWeek)
    classItem.start_time = startTime
    classItem.end_time = endTime
    classItem.room = room || null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="card w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Edit class</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveDetails} className="space-y-4 mb-6 pb-6 border-b border-sand-200">
          {detailsError && <Alert tone="rose">{detailsError}</Alert>}
          {detailsSaved && <Alert tone="brand">Class details saved.</Alert>}
          <div>
            <label className="field-label">Class name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Day of week</label>
            <select className="field-input" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Start time</label>
              <input
                type="time"
                className="field-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">End time</label>
              <input type="time" className="field-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Room (optional)</label>
            <input className="field-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 2" />
          </div>
          <button type="submit" disabled={savingDetails} className="btn-primary">
            {savingDetails ? 'Saving…' : 'Save class details'}
          </button>
        </form>

        <div className="flex gap-2 border-b border-sand-200 mb-4">
          {[
            { key: 'students', label: 'Students', icon: Users2 },
            { key: 'teachers', label: 'Teachers', icon: UserCog },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === t.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-500 hover:text-ink-900'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        <MembersChecklist
          key={subTab}
          orgId={orgId}
          createdBy={createdBy}
          classItem={classItem}
          mode={subTab}
          onSaved={onSaved}
          onClose={onClose}
        />
      </div>
    </div>
  )
}

// The actual tick-list + save/cancel — swapped out based on which sub-tab is active.
function MembersChecklist({ orgId, createdBy, classItem, mode, onSaved, onClose }) {
  const isTeacherMode = mode === 'teachers'
  const table = isTeacherMode ? 'class_teachers' : 'class_enrollments'
  const memberTable = isTeacherMode ? 'profiles' : 'students'
  const memberIdField = isTeacherMode ? 'teacher_id' : 'student_id'

  const [allMembers, setAllMembers] = useState([])
  const [linkedIds, setLinkedIds] = useState(new Set())
  const [checked, setChecked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: members }, { data: links }] = await Promise.all([
        supabase.from(memberTable).select('id, full_name').eq('org_id', orgId).order('full_name'),
        supabase.from(table).select(memberIdField).eq('class_id', classItem.id),
      ])
      const linkedSet = new Set((links || []).map((l) => l[memberIdField]))
      setAllMembers(members || [])
      setLinkedIds(linkedSet)
      setChecked(new Set(linkedSet))
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    const toAdd = [...checked].filter((id) => !linkedIds.has(id))
    const toRemove = [...linkedIds].filter((id) => !checked.has(id))

    if (toAdd.length > 0) {
      const rows = toAdd.map((id) => ({
        org_id: orgId,
        class_id: classItem.id,
        [memberIdField]: id,
        created_by: createdBy,
      }))
      const { error: insertError } = await supabase.from(table).insert(rows)
      if (insertError) {
        setSaving(false)
        setError(insertError.message)
        return
      }
    }

    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('class_id', classItem.id)
        .in(memberIdField, toRemove)
      if (deleteError) {
        setSaving(false)
        setError(deleteError.message)
        return
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : allMembers.length === 0 ? (
        <EmptyState
          icon={isTeacherMode ? UserCog : Users2}
          title={isTeacherMode ? 'No staff found' : 'No students yet'}
          description={isTeacherMode ? undefined : 'Add students in the Students tab first.'}
        />
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto border border-sand-200 rounded-md p-2">
          {allMembers.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-3 px-2 py-2 rounded hover:bg-sand-50 cursor-pointer text-sm"
            >
              <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggle(m.id)} />
              {m.full_name}
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-5">
        <button onClick={handleSave} disabled={saving || loading} className="btn-primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={onClose} className="btn-secondary">
          Close
        </button>
      </div>
    </div>
  )
}

// =========================================================
// By Teacher — bulk assign/remove which classes a teacher teaches
// =========================================================
function ByTeacherTab() {
  const { profile } = useAuth()
  const [teachers, setTeachers] = useState([])
  const [teacherId, setTeacherId] = useState('')
  const [classes, setClasses] = useState([])
  const [checked, setChecked] = useState(new Set())
  const [originalIds, setOriginalIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) loadTeachers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadTeachers() {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('org_id', profile.org_id).order('full_name')
    setTeachers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (teacherId) loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId])

  async function loadClasses() {
    setLoading(true)
    setSaved(false)
    const [{ data: classData }, { data: linkData }] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('day_of_week')
        .order('start_time'),
      supabase.from('class_teachers').select('class_id').eq('teacher_id', teacherId),
    ])
    setClasses(classData || [])
    const assigned = new Set((linkData || []).map((l) => l.class_id))
    setChecked(assigned)
    setOriginalIds(assigned)
    setLoading(false)
  }

  function toggle(classId) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)

    const toAssign = [...checked].filter((id) => !originalIds.has(id))
    const toRemove = [...originalIds].filter((id) => !checked.has(id))

    if (toAssign.length > 0) {
      const rows = toAssign.map((classId) => ({
        org_id: profile.org_id,
        class_id: classId,
        teacher_id: teacherId,
        created_by: profile.id,
      }))
      const { error: assignError } = await supabase.from('class_teachers').insert(rows)
      if (assignError) {
        setSaving(false)
        setError(assignError.message)
        return
      }
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from('class_teachers')
        .delete()
        .eq('teacher_id', teacherId)
        .in('class_id', toRemove)
      if (removeError) {
        setSaving(false)
        setError(removeError.message)
        return
      }
    }

    setSaving(false)
    setSaved(true)
    loadClasses()
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="card p-5">
        <label className="field-label">Teacher</label>
        <select className="field-input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">— Select a teacher —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-500 mt-2">
          <UserCog size={12} className="inline mr-1" />
          Tick any classes to assign them to this teacher; untick to remove — useful when
          reassigning or offboarding a resigning teacher all at once. A class can have more than
          one teacher.
        </p>
      </div>

      {error && <Alert tone="rose">{error}</Alert>}
      {saved && <Alert tone="brand">Saved.</Alert>}

      {teacherId && (
        <div className="card overflow-hidden">
          {loading ? (
            <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
          ) : classes.length === 0 ? (
            <EmptyState icon={School} title="No classes yet" description="Create classes in the Classes tab first." />
          ) : (
            <div className="divide-y divide-sand-100 max-h-96 overflow-y-auto">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-sand-50 cursor-pointer">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{c.name}</p>
                    <p className="text-xs text-ink-500">
                      {DAY_NAMES[c.day_of_week]} · {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                      {c.room ? ` · ${c.room}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {teacherId && (
        <button onClick={handleSave} disabled={saving || loading} className="btn-primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
    </div>
  )
}
