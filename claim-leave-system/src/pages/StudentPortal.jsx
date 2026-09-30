import { LogOut } from 'lucide-react'
import { usePortalAuth } from '../context/PortalAuthContext'
import PortalDashboard from '../components/PortalDashboard'

export default function StudentPortal() {
  const { linkedStudents, signOut } = usePortalAuth()
  const student = linkedStudents[0]

  if (!student) {
    return (
      <div className="min-h-screen bg-sand-50 px-4 py-8">
        <div className="max-w-md mx-auto card p-6 text-center">
          <p className="text-sm text-ink-700">This login isn't linked to a student record yet. Please contact the centre.</p>
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
          <p className="font-semibold text-ink-900">Student Portal</p>
          <p className="text-xs text-ink-500">{student.full_name}</p>
        </div>
        <button onClick={signOut} className="btn-secondary text-sm">
          <LogOut size={14} /> Sign out
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        <PortalDashboard student={student} />
      </main>
    </div>
  )
}
