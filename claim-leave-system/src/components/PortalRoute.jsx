import { Navigate } from 'react-router-dom'
import { usePortalAuth } from '../context/PortalAuthContext'

export function PortalRoute({ children, requireType }) {
  const { session, account, loading } = usePortalAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50">
        <p className="text-sm text-ink-500">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to={requireType === 'student' ? '/student-login' : '/parent-login'} replace />
  }

  if (account?.type === 'registration_pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
        <div className="card max-w-sm p-6 text-center">
          {account.status === 'pending' ? (
            <p className="text-sm text-ink-700">
              Your registration is still pending review by the centre. You'll be able to sign in once it's approved.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-700">Your registration was not approved.</p>
              {account.rejectionReason && <p className="text-xs text-ink-500 mt-2">Reason: {account.rejectionReason}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
        <div className="card max-w-sm p-6 text-center">
          <p className="text-sm text-ink-700">
            This account isn't set up as a {requireType === 'student' ? 'student' : 'parent'} login yet. Please
            contact the centre.
          </p>
        </div>
      </div>
    )
  }

  if (requireType && account.type !== requireType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
        <div className="card max-w-sm p-6 text-center">
          <p className="text-sm text-ink-700">
            This login is a {account.type} account, not a {requireType} account. Please use the correct portal.
          </p>
        </div>
      </div>
    )
  }

  return children
}
