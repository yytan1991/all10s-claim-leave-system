import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CompanyPicker from '../pages/CompanyPicker'

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
    return (
      <div className="flex h-screen items-center justify-center text-ink-500 text-sm px-4 text-center">
        {memberships.length === 0
          ? "No account access found for this login. Please contact your administrator."
          : 'Loading your account…'}
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
