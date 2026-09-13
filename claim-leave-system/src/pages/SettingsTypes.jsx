import { useEffect, useState } from 'react'
import { Plus, Trash2, MapPin, LocateFixed } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { getCurrentPosition } from '../lib/geo'

export default function SettingsTypes() {
  const [tab, setTab] = useState('leave')

  return (
    <AppLayout title="Settings" subtitle="Configure leave types, claim types, work locations, and CRM pipeline.">
      <div className="mb-6 flex gap-2 border-b border-sand-200 flex-wrap">
        {[
          { key: 'leave', label: 'Leave types' },
          { key: 'claim', label: 'Claim types' },
          { key: 'locations', label: 'Work locations' },
          { key: 'stages', label: 'Pipeline stages' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'leave' && <TypeManager table="leave_types" hasAttachmentFlag />}
      {tab === 'claim' && <TypeManager table="claim_types" />}
      {tab === 'locations' && <LocationManager />}
      {tab === 'stages' && <StageManager />}
    </AppLayout>
  )
}

function StageManager() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [isWon, setIsWon] = useState(false)
  const [isLost, setIsLost] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('crm_stages').select('*').order('sort_order')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function addStage(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1
    const { error: insertError } = await supabase.from('crm_stages').insert({
      name: name.trim(),
      sort_order: nextOrder,
      is_won: isWon,
      is_lost: isLost,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setIsWon(false)
    setIsLost(false)
    load()
  }

  async function moveStage(id, direction) {
    const index = rows.findIndex((r) => r.id === id)
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= rows.length) return
    const a = rows[index]
    const b = rows[swapWith]
    await Promise.all([
      supabase.from('crm_stages').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('crm_stages').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    load()
  }

  async function removeStage(id) {
    if (!confirm('Remove this stage? Leads on it will need to be moved manually.')) return
    await supabase.from('crm_stages').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={addStage} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Stage name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trial Scheduled"
          />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={isWon} onChange={(e) => setIsWon(e.target.checked)} />
            Marks a lead as won (closed)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={isLost} onChange={(e) => setIsLost(e.target.checked)} />
            Marks a lead as lost (closed)
          </label>
        </div>
        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add stage
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No pipeline stages configured yet.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col -space-y-1">
                    <button
                      onClick={() => moveStage(r.id, 'up')}
                      disabled={i === 0}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveStage(r.id, 'down')}
                      disabled={i === rows.length - 1}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{r.name}</p>
                    {(r.is_won || r.is_lost) && (
                      <p className="text-xs text-ink-500">{r.is_won ? 'Won stage' : 'Lost stage'}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => removeStage(r.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LocationManager() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radius, setRadius] = useState(50)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('work_locations').select('*').order('name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function useMyLocation() {
    setError('')
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      setLatitude(pos.lat.toFixed(6))
      setLongitude(pos.lng.toFixed(6))
    } catch (err) {
      setError(err.message || 'Could not get your current location.')
    }
    setLocating(false)
  }

  async function addLocation(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !latitude || !longitude) {
      setError('Fill in a name and coordinates (or use "Use my current location").')
      return
    }
    const { error: insertError } = await supabase.from('work_locations').insert({
      name: name.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius_meters: Number(radius) || 50,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setLatitude('')
    setLongitude('')
    setRadius(50)
    load()
  }

  async function removeLocation(id) {
    if (!confirm('Remove this location? Staff will no longer be able to clock in from it.')) return
    await supabase.from('work_locations').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={addLocation} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Location name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ALL 10S EDU Cheras Centre"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Latitude</label>
            <input
              className="field-input"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="3.073800"
            />
          </div>
          <div>
            <label className="field-label">Longitude</label>
            <input
              className="field-input"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="101.737000"
            />
          </div>
        </div>

        <button type="button" onClick={useMyLocation} disabled={locating} className="btn-secondary text-sm">
          <LocateFixed size={15} /> {locating ? 'Getting location…' : 'Use my current location'}
        </button>
        <p className="text-xs text-ink-500 -mt-2">
          Stand at the centre on your phone/laptop and tap this to auto-fill the coordinates.
        </p>

        <div>
          <label className="field-label">Check-in radius (meters)</label>
          <input
            type="number"
            min="10"
            className="field-input w-32"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add location
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No work locations yet"
            description="Add one above so staff can clock in and out."
          />
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{r.name}</p>
                  <p className="text-xs text-ink-500">
                    {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)} · {r.radius_meters}m radius
                  </p>
                </div>
                <button onClick={() => removeLocation(r.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TypeManager({ table, hasAttachmentFlag }) {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [requiresAttachment, setRequiresAttachment] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from(table).select('*').order('name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [table])

  async function addType(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    const payload = hasAttachmentFlag
      ? { name: name.trim(), requires_attachment: requiresAttachment }
      : { name: name.trim() }
    const { error: insertError } = await supabase.from(table).insert(payload)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setRequiresAttachment(false)
    load()
  }

  async function removeType(id) {
    if (!confirm('Remove this type? Existing records will keep their history.')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={addType} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={hasAttachmentFlag ? 'e.g. Annual Leave' : 'e.g. Travel & Mileage'}
          />
        </div>
        {hasAttachmentFlag && (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={requiresAttachment}
              onChange={(e) => setRequiresAttachment(e.target.checked)}
            />
            Requires a supporting document
          </label>
        )}
        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add type
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No types configured yet.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{r.name}</p>
                  {hasAttachmentFlag && r.requires_attachment && (
                    <p className="text-xs text-ink-500">Requires supporting document</p>
                  )}
                </div>
                <button onClick={() => removeType(r.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
