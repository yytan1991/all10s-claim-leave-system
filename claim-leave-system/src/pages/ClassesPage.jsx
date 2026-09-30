import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Users2, CalendarClock, UserCog, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { DAY_NAMES, formatTimeLabel, RECURRENCE_OPTIONS } from '../lib/helpers'

function computePeriodLabel(dateStr, intervalMonths) {
  if (!dateStr) return ''
  const start = new Date(`${dateStr}T00:00:00`)
  const startLabel = start.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  const months = Number(intervalMonths) || 1
  if (months <= 1) return startLabel
  const end = new Date(start)
  end.setMonth(end.getMonth() + months - 1)
  const endLabel = end.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

export default function ClassesPage() {
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
      supabase
        .from('class_teachers')
        .select('class_id, profiles!class_teachers_teacher_id_fkey(full_name)')
        .eq('org_id', profile.org_id),
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
    <AppLayout title="Classes" subtitle="Weekly class schedule, fees, and teacher/student assignment.">
      <div className="flex justify-end mb-4">
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
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Day &amp; time</th>
                  <th className="px-5 py-3 font-medium">Teachers</th>
                  <th className="px-5 py-3 font-medium">Room</th>
                  <th className="px-5 py-3 font-medium">Fee</th>
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
                    <td className="px-5 py-3 text-ink-700">
                      {c.fee_amount != null ? `RM ${Number(c.fee_amount).toFixed(2)}` : '—'}
                    </td>
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
    </AppLayout>
  )
}

function CreateClassModal({ orgId, createdBy, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('16:00')
  const [room, setRoom] = useState('')
  const [feeAmount, setFeeAmount] = useState('')
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
      fee_amount: feeAmount === '' ? null : Number(feeAmount),
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Room (optional)</label>
              <input className="field-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 2" />
            </div>
            <div>
              <label className="field-label">Fee (RM, optional)</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="e.g. 150"
              />
            </div>
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

function EditClassModal({ orgId, createdBy, classItem, onClose, onSaved }) {
  const [subTab, setSubTab] = useState('students')
  const [name, setName] = useState(classItem.name)
  const [dayOfWeek, setDayOfWeek] = useState(classItem.day_of_week)
  const [startTime, setStartTime] = useState(classItem.start_time?.slice(0, 5) || '')
  const [endTime, setEndTime] = useState(classItem.end_time?.slice(0, 5) || '')
  const [room, setRoom] = useState(classItem.room || '')
  const [feeAmount, setFeeAmount] = useState(classItem.fee_amount ?? '')
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
        fee_amount: feeAmount === '' ? null : Number(feeAmount),
      })
      .eq('id', classItem.id)
    setSavingDetails(false)
    if (updateError) {
      setDetailsError(updateError.message)
      return
    }
    setDetailsSaved(true)
    classItem.name = name.trim()
    classItem.day_of_week = Number(dayOfWeek)
    classItem.start_time = startTime
    classItem.end_time = endTime
    classItem.room = room || null
    classItem.fee_amount = feeAmount === '' ? null : Number(feeAmount)
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Room (optional)</label>
              <input className="field-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 2" />
            </div>
            <div>
              <label className="field-label">Fee (RM, optional)</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="e.g. 150"
              />
            </div>
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
  const [search, setSearch] = useState('')
  const [perStudentFrequency, setPerStudentFrequency] = useState({})

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

  function setFrequencyFor(id, value) {
    setPerStudentFrequency((prev) => ({ ...prev, [id]: value }))
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

    // Newly enrolled students each get their own recurring invoice plan if a
    // billing frequency was picked for them individually. Adjust or delete
    // any of these anytime afterward from the Recurring Invoice page.
    const studentsWithFrequency = toAdd.filter((id) => perStudentFrequency[id])
    if (!isTeacherMode && studentsWithFrequency.length > 0) {
      const feeAmount = Number(classItem.fee_amount || 0)
      const today = new Date().toISOString().slice(0, 10)
      const planRows = studentsWithFrequency.map((studentId) => {
        const freq = perStudentFrequency[studentId]
        return {
          org_id: orgId,
          student_id: studentId,
          items: [{ description: classItem.name, amount: feeAmount }],
          amount: feeAmount,
          recurrence_interval_months: Number(freq),
          next_generation_date: today,
          next_invoice_month: computePeriodLabel(today, freq),
          created_by: createdBy,
        }
      })
      const { error: planError } = await supabase.from('recurring_invoice_plans').insert(planRows)
      if (planError) {
        setSaving(false)
        setError(`Enrollment saved, but creating recurring invoices failed: ${planError.message}`)
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
          description={isTeacherMode ? undefined : 'Add students in the Students page first.'}
        />
      ) : (
        <>
          <input
            type="text"
            className="field-input mb-2"
            placeholder={`Search ${isTeacherMode ? 'staff' : 'students'}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {checked.size > 0 && <p className="text-xs text-ink-500 mb-2">{checked.size} selected</p>}
          <div className="space-y-1 max-h-72 overflow-y-auto border border-sand-200 rounded-md p-2">
            {allMembers
              .filter((m) => m.full_name?.toLowerCase().includes(search.trim().toLowerCase()))
              .map((m) => {
                const isNew = checked.has(m.id) && !linkedIds.has(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-sand-50 text-sm">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggle(m.id)} />
                      {m.full_name}
                    </label>
                    {!isTeacherMode && isNew && (
                      <select
                        className="field-input text-xs py-1 w-40 shrink-0"
                        value={perStudentFrequency[m.id] || ''}
                        onChange={(e) => setFrequencyFor(m.id, e.target.value)}
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
            {allMembers.filter((m) => m.full_name?.toLowerCase().includes(search.trim().toLowerCase())).length ===
              0 && <p className="text-sm text-ink-500 px-2 py-3">No matches for "{search}".</p>}
          </div>
        </>
      )}

      {!isTeacherMode && !loading && allMembers.length > 0 && (
        <p className="text-xs text-ink-500 mt-3">
          {classItem.fee_amount != null
            ? `Pick a billing frequency next to any newly-ticked student to set up a recurring invoice at RM ${Number(classItem.fee_amount).toFixed(2)} for them. Leave it on "No invoice" to skip. Only applies to students being added now — already-enrolled students are unaffected.`
            : 'This class has no fee set, so a recurring invoice would be RM 0.00 — set a fee on the class details above first if you want billing to charge anything.'}
        </p>
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
