import { Building2, ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Alert } from '../components/UI'

export default function CompanyPicker() {
  const { memberships, selectMembership, signOut, suspendedNotice } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="font-display text-xl font-semibold text-ink-900">ALL10S ERP</p>
          <p className="text-sm text-ink-500 mt-1">Which account are you signing in as?</p>
        </div>

        {suspendedNotice && (
          <div className="mb-4">
            <Alert tone="rose">{suspendedNotice}</Alert>
          </div>
        )}

        <div className="space-y-2">
          {memberships.map((m) => {
            const isSuperadminRow = m.role === 'superadmin'
            return (
              <button
                key={m.id}
                onClick={() => selectMembership(m.id)}
                className="card w-full p-4 flex items-center justify-between text-left hover:border-brand-500 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-brand-50 p-2 text-brand-700">
                    {isSuperadminRow ? <ShieldCheck size={18} /> : <Building2 size={18} />}
                  </div>
                  <div>
                    <p className="font-medium text-ink-900">
                      {isSuperadminRow ? 'Superadmin' : m.organizations?.name || 'Unknown organization'}
                    </p>
                    <p className="text-xs text-ink-500 capitalize">
                      {isSuperadminRow ? 'Manage all organizations' : m.role}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button onClick={signOut} className="btn-secondary w-full mt-6">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}