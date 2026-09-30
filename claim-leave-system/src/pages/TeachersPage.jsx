import { useEffect, useState } from 'react'
import { School, UserCog } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { DAY_NAMES, formatTimeLabel } from '../lib/helpers'

export default function TeachersPage() {
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
    <AppLayout title="Teachers" subtitle="Bulk assign or remove which classes a teacher teaches.">
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
              <EmptyState icon={School} title="No classes yet" description="Create classes on the Classes page first." />
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
    </AppLayout>
  )
}
