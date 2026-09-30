import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { usePortalAuth } from '../context/PortalAuthContext'
import PortalDashboard from '../components/PortalDashboard'

export default function ParentPortal() {
  const { account, linkedStudents, signOut } = usePortalAuth()
  const [selectedId, setSelectedId] = useState(linkedStudents[0]?.id || '')

  const selectedStudent = linkedStudents.find((s) => s.id === selectedId) || linkedStudents[0]

  if (linkedStudents.length === 0) {
    return (
      <div className="min-h-screen bg-sand-50 px-4 py-8">
        <div className="max-w-md mx-auto card p-6 text-center">
          <p className="text-sm text-ink-700">
            No children are linked to this account yet. Please contact the centre.
          </p>
          <button onClick={signOut} className="btn-secondary text-sm mt-4">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="bg-white border-b border-sand-200 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-ink-900">Parent Portal</p>
          <p className="text-xs text-ink-500">{account?.full_name}</p>
        </div>
        <button onClick={signOut} className="btn-secondary text-sm">
          <LogOut size={14} /> Sign out
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        {linkedStudents.length > 1 && (
          <div className="mb-6">
            <label className="field-label">Viewing</label>
            <select
              className="field-input max-w-xs"
              value={selectedStudent?.id || ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {linkedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {linkedStudents.length === 1 && (
          <h1 className="text-lg font-semibold text-ink-900 mb-6">{selectedStudent.full_name}</h1>
        )}

        <PortalDashboard student={selectedStudent} />
      </main>
    </div>
  )
}
