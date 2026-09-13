import { useEffect, useState } from 'react'
import { Users, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import SuperadminLayout from '../components/SuperadminLayout'
import { EmptyState, Alert } from '../components/UI'

export default function SuperadminUsers() {
  const [users, setUsers] = useState([])
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: userData }, { data: orgData }] = await Promise.all([
      supabase.from('profiles').select('*, organizations(name)').order('full_name'),
      supabase.from('organizations').select('id, name').order('name'),
    ])
    setUsers(userData || [])
    setOrgs(orgData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function updateUser(id, patch) {
    setError('')
    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  return (
    <SuperadminLayout
      title="Users"
      subtitle="Every membership across every organization. Add someone to an org, or reassign an existing membership below."
    >
      <div className="flex justify-end mb-4">
        <button onClick={() => setAdding(true)} className="btn-primary text-sm">
          <UserPlus size={15} /> Add user to organization
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{u.full_name}</td>
                    <td className="px-5 py-3 text-ink-700">{u.email}</td>
                    <td className="px-5 py-3">
                      <select
                        className="field-input py-1.5 text-sm w-44"
                        value={u.org_id || ''}
                        onChange={(e) => updateUser(u.id, { org_id: e.target.value || null })}
                      >
                        <option value="">— No organization —</option>
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="field-input py-1.5 text-sm w-32"
                        value={u.role}
                        onChange={(e) => updateUser(u.id, { role: e.target.value })}
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && (
        <AddUserModal
          orgs={orgs}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}
    </SuperadminLayout>
  )
}

function AddUserModal({ orgs, onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgId, setOrgId] = useState(orgs[0]?.id || '')
  const [role, setRole] = useState('staff')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !fullName.trim() || !orgId) {
      setError('Fill in email, full name, and pick an organization.')
      return
    }
    setSaving(true)

    const { data: foundUserId, error: lookupError } = await supabase.rpc('find_user_id_by_email', {
      p_email: email.trim(),
    })

    if (lookupError) {
      setSaving(false)
      setError(lookupError.message)
      return
    }
    if (!foundUserId) {
      setSaving(false)
      setError(
        "No existing login found with that email. If they're brand new, invite them first from Supabase (Authentication \u2192 Users \u2192 Invite user), then add them here."
      )
      return
    }

    const { error: insertError } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      user_id: foundUserId,
      full_name: fullName.trim(),
      email: email.trim(),
      org_id: orgId,
      role,
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
          <h3 className="font-semibold text-ink-900">Add user to organization</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-ink-500 mb-4">
          Use this for an email that already has a login (e.g. yourself, or someone from another
          branch) who now also needs access to a specific organization.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}

          <div>
            <label className="field-label">Email (existing login)</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="field-label">Full name</label>
            <input
              className="field-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Organization</label>
            <select className="field-input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Role</label>
            <select className="field-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Adding…' : 'Add to organization'}
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