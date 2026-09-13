import { useEffect, useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import SuperadminLayout from '../components/SuperadminLayout'
import { Alert, EmptyState, StatusPill } from '../components/UI'
import { formatDate } from '../lib/helpers'

export default function SuperadminOrganizations() {
  const [orgs, setOrgs] = useState([])
  const [staffCounts, setStaffCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data: orgData } = await supabase.from('organizations').select('*').order('created_at')
    setOrgs(orgData || [])

    const { data: profileData } = await supabase.from('profiles').select('org_id')
    const counts = {}
    ;(profileData || []).forEach((p) => {
      if (!p.org_id) return
      counts[p.org_id] = (counts[p.org_id] || 0) + 1
    })
    setStaffCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(org) {
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ is_active: !org.is_active })
      .eq('id', org.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  async function createOrg(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    setCreating(true)
    const { error: insertError } = await supabase.from('organizations').insert({ name: name.trim() })
    setCreating(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    load()
  }

  return (
    <SuperadminLayout
      title="Organizations"
      subtitle="Every school or company using this system, and whether their access is active."
    >
      <form onSubmit={createOrg} className="card p-5 mb-6 flex items-end gap-3">
        {error && (
          <div className="w-full mb-2">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}
        <div className="flex-1">
          <label className="field-label">New organization name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bright Minds Tuition Centre"
          />
        </div>
        <button type="submit" disabled={creating} className="btn-primary">
          <Plus size={15} /> {creating ? 'Creating…' : 'Add organization'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : orgs.length === 0 ? (
        <EmptyState icon={Building2} title="No organizations yet" description="Add the first one above." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Staff</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {orgs.map((org) => (
                  <tr key={org.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{org.name}</td>
                    <td className="px-5 py-3 text-ink-700">{staffCounts[org.id] || 0}</td>
                    <td className="px-5 py-3 text-ink-500">{formatDate(org.created_at?.slice(0, 10))}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={org.is_active ? 'approved' : 'rejected'} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toggleActive(org)}
                        className={org.is_active ? 'btn-danger text-xs' : 'btn-primary text-xs'}
                      >
                        {org.is_active ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-500 mt-4">
        Suspending an organization blocks their staff from logging in going forward — anyone already
        signed in stays signed in until they log out. To onboard a new organization's first admin,
        invite them from Supabase (Authentication → Users → Invite user), then assign them to this
        organization and set their role to "admin" on the Users tab.
      </p>
    </SuperadminLayout>
  )
}
