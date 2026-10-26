import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CompanyPicker from '../pages/CompanyPicker'

// Shown when someone is signed in but has no staff profile — typically a parent or
// student who ended up on the staff site (for example from an emailed link).
function NotStaffNotice() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <div className="card max-w-sm p-6 text-center">
        <p className="text-sm text-ink-700 mb-1">This login isn't a staff account, so it can't use this part of WiiTeam.</p>
        <p className="text-xs text-ink-500 mb-4">If you're staff, please contact your administrator.</p>
        <div className="flex flex-col gap-2">
          <a href="/parent-portal" className="btn-primary text-sm">
            I'm a parent — go to the parent portal
          </a>
          <a href="/student-portal" className="btn-secondary text-sm">
            I'm a student — go to the student portal
          </a>
          <button onClick={signOut} className="text-sm text-ink-500 hover:underline mt-1">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children, requireManager, requireAdmin, requireSuperadmin }) {
  const { session, loading, profile, memberships, needsCompanyPicker, isManager, isAdmin, isSuperadmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-500 text-sm">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (needsCompanyPicker) {
    return <CompanyPicker />
  }

  if (!profile) {
    if (memberships.length === 0) {
      return <NotStaffNotice />
    }
    return (
      <div className="flex h-screen items-center justify-center text-ink-500 text-sm px-4 text-center">
        Loading your account…
      </div>
    )
  }

  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/" replace />
  }

  // A superadmin has no tenant data of their own — keep them out of the
  // regular org-scoped pages and route them back to their own section.
  if (!requireSuperadmin && isSuperadmin) {
    return <Navigate to="/superadmin" replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireManager && !isManager) {
    return <Navigate to="/" replace />
  }

  return children
}
