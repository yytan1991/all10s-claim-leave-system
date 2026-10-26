import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import ProgressView from '../components/ProgressView'
import { EmptyState } from '../components/UI'

export default function StudentProgressPage() {
  const { profile, isAdmin } = useAuth()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadClasses() {
    setLoading(true)
    const { data: classData } = await supabase.from('classes').select('id, name').eq('org_id', profile.org_id).order('name')
    let list = classData || []
    if (!isAdmin) {
      const { data: links } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile.id)
      const allowed = new Set((links || []).map((l) => l.class_id))
      list = list.filter((c) => allowed.has(c.id))
    }
    setClasses(list)
    if (list.length > 0) setClassId((prev) => prev || list[0].id)
    setLoading(false)
  }

  useEffect(() => {
    if (!classId) return
    setStudentId('')
    supabase
      .from('class_enrollments')
      .select('students(id, full_name)')
      .eq('class_id', classId)
      .then(({ data }) => {
        const list = (data || [])
          .map((e) => e.students)
          .filter(Boolean)
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
        setStudents(list)
        if (list.length > 0) setStudentId(list[0].id)
      })
  }, [classId])

  return (
    <AppLayout title="Student Progress" subtitle="See how a student is doing and leave a short comment their parents can read.">
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No classes available"
          description={isAdmin ? 'Create a class first, under Student Management.' : "You're not assigned to teach any classes yet."}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mb-6">
            <div>
              <label className="field-label">Class</label>
              <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Student</label>
              <select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={students.length === 0}>
                {students.length === 0 && <option value="">No students in this class</option>}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {studentId && (
            <div className="max-w-3xl">
              <ProgressView
                key={studentId}
                studentId={studentId}
                orgId={profile.org_id}
                authorId={profile.id}
                authorName={profile.full_name}
                defaultClassId={classId}
              />
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
