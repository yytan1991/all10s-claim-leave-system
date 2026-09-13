import { useEffect, useState } from 'react'
import { Users, X, Clock, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { EmptyState, Alert } from '../components/UI'

export default function Employees() {
  const { profile } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editingHours, setEditingHours] = useState(null)
  const [addingExisting, setAddingExisting] = useState(false)

  useEffect(() => {
    if (profile) loadEmployees()
  }, [profile?.org_id])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('full_name')
    setEmployees(data || [])
    setLoading(false)
  }

  async function updateRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, role } : e)))
  }

  return (
    <AppLayout title="Employees" subtitle="Manage staff roles and leave entitlements.">
      <div className="flex justify-end mb-4">
        <button onClick={() => setAddingExisting(true)} className="btn-secondary text-sm">
          <UserPlus size={15} /> Add existing staff member
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff accounts yet"
          description="Invite staff via Supabase Auth, then their profile will appear here."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Work hours</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 font-medium text-ink-900">{e.full_name}</td>
                  <td className="px-5 py-3 text-ink-700">{e.email}</td>
                  <td className="px-5 py-3 text-ink-700">{e.department || '—'}</td>
                  <td className="px-5 py-3">
                    <select
                      value={e.role}
                      onChange={(ev) => updateRole(e.id, ev.target.value)}
                      className="field-input py-1.5 text-sm w-32"
                    >
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 text-ink-700 text-xs">
                    {(e.work_start_time || '09:00').slice(0, 5)} – {(e.work_end_time || '18:00').slice(0, 5)}
                  </td>
                  <td className="px-5 py-3 text-right space-x-3">
                    <button
                      onClick={() => setEditingHours(e)}
                      className="text-brand-600 hover:underline text-xs font-medium"
                    >
                      Set work hours
                    </button>
                    <button
                      onClick={() => setEditing(e)}
                      className="text-brand-600 hover:underline text-xs font-medium"
                    >
                      Set leave balance
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editing && <LeaveBalanceModal employee={editing} onClose={() => setEditing(null)} />}
      {editingHours && (
        <WorkHoursModal
          employee={editingHours}
          onClose={() => setEditingHours(null)}
          onSaved={(updated) => {
            setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
            setEditingHours(null)
          }}
        />
      )}
      {addingExisting && (
        <AddExistingStaffModal
          orgId={profile.org_id}
          onClose={() => setAddingExisting(false)}
          onSaved={() => {
            setAddingExisting(false)
            loadEmployees()
          }}
        />
      )}
    </AppLayout>
  )
}

function AddExistingStaffModal({ orgId, onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('staff')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !fullName.trim()) {
      setError('Enter both their email and full name.')
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
        "No existing login found with that email. If they're brand new, invite them instead from Supabase (Authentication \u2192 Users \u2192 Invite user)."
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
          <h3 className="font-semibold text-ink-900">Add existing staff member</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-ink-500 mb-4">
          Use this for someone who already has a login at another branch/company and now also
          needs access here. They'll be able to switch between both after signing in.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}

          <div>
            <label className="field-label">Their email (existing login)</label>
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
            <label className="field-label">Role at this organization</label>
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

function WorkHoursModal({ employee, onClose, onSaved }) {
  const [startTime, setStartTime] = useState((employee.work_start_time || '09:00').slice(0, 5))
  const [endTime, setEndTime] = useState((employee.work_end_time || '18:00').slice(0, 5))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ work_start_time: startTime, work_end_time: endTime })
      .eq('id', employee.id)
      .select()
      .single()
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onSaved(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900 flex items-center gap-2">
            <Clock size={16} /> Work hours · {employee.full_name}
          </h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Start time</label>
            <input
              type="time"
              className="field-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">End time</label>
            <input
              type="time"
              className="field-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-ink-500 mt-2">
          Clocking in after the start time will be marked late automatically.
        </p>

        <div className="flex gap-3 pt-5">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save work hours'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function LeaveBalanceModal({ employee, onClose }) {
  const year = new Date().getFullYear()
  const [leaveTypes, setLeaveTypes] = useState([])
  const [balances, setBalances] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: types } = await supabase
        .from('leave_types')
        .select('*')
        .eq('org_id', employee.org_id)
        .order('name')
      setLeaveTypes(types || [])
      const { data: existing } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('profile_id', employee.id)
        .eq('year', year)
      const map = {}
      ;(existing || []).forEach((b) => {
        map[b.leave_type_id] = { entitled_days: b.entitled_days, used_days: b.used_days }
      })
      setBalances(map)
    }
    load()
  }, [employee.id])

  function setEntitled(typeId, value) {
    setBalances((prev) => ({
      ...prev,
      [typeId]: { ...prev[typeId], entitled_days: value, used_days: prev[typeId]?.used_days || 0 },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const rows = leaveTypes.map((t) => ({
      profile_id: employee.id,
      org_id: employee.org_id,
      leave_type_id: t.id,
      year,
      entitled_days: Number(balances[t.id]?.entitled_days || 0),
      used_days: Number(balances[t.id]?.used_days || 0),
    }))
    const { error: upsertError } = await supabase
      .from('leave_balances')
      .upsert(rows, { onConflict: 'profile_id,leave_type_id,year' })
    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">
            Leave balance · {employee.full_name} ({year})
          </h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {leaveTypes.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <label className="text-sm text-ink-700 flex-1">{t.name}</label>
              <input
                type="number"
                min="0"
                className="field-input w-24"
                value={balances[t.id]?.entitled_days ?? ''}
                placeholder="days"
                onChange={(e) => setEntitled(t.id, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-5">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save entitlements'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
