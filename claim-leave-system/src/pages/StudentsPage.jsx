import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Users2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

export default function StudentsPage() {
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
    <AppLayout title="Students" subtitle="Student records. Billing setup lives under Recurring Invoice.">
      <div className="flex justify-end mb-4">
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
    </AppLayout>
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
