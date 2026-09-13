import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Pencil, Trash2, Plus, Phone, School as SchoolIcon } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { formatDate, stagePillClass } from '../lib/helpers'

export default function CrmLeadDetail() {
  const { id } = useParams()
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [contact, setContact] = useState(null)
  const [stages, setStages] = useState([])
  const [followups, setFollowups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newNote, setNewNote] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function load() {
    setLoading(true)
    const [{ data: contactData, error: contactError }, { data: stageData }, { data: followupData }] =
      await Promise.all([
        supabase
          .from('crm_contacts')
          .select('*, crm_stages(name, is_won, is_lost), profiles!crm_contacts_pic_id_fkey(full_name)')
          .eq('id', id)
          .single(),
        supabase.from('crm_stages').select('*').order('sort_order'),
        supabase
          .from('crm_followups')
          .select('*, profiles(full_name)')
          .eq('contact_id', id)
          .order('followup_date', { ascending: false }),
      ])
    if (contactError) setError(contactError.message)
    setContact(contactData || null)
    setStages(stageData || [])
    setFollowups(followupData || [])
    setLoading(false)
  }

  async function changeStage(stageId) {
    await supabase.from('crm_contacts').update({ stage_id: stageId }).eq('id', id)
    load()
  }

  async function addFollowup(e) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    const { error: insertError } = await supabase.from('crm_followups').insert({
      contact_id: id,
      followup_date: newDate,
      notes: newNote.trim(),
      created_by: profile.id,
    })
    setSavingNote(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewNote('')
    load()
  }

  async function handleDelete() {
    if (!confirm('Delete this lead permanently? This also removes its follow-up history.')) return
    await supabase.from('crm_contacts').delete().eq('id', id)
    navigate('/crm/leads')
  }

  if (loading) {
    return (
      <AppLayout title="Lead">
        <p className="text-sm text-ink-500">Loading…</p>
      </AppLayout>
    )
  }

  if (!contact) {
    return (
      <AppLayout title="Lead not found">
        <Alert tone="rose">{error || "This lead doesn't exist or you don't have access to it."}</Alert>
      </AppLayout>
    )
  }

  const stageIndex = stages.findIndex((s) => s.id === contact.stage_id)

  return (
    <AppLayout title={contact.parent_name} subtitle="Lead details and follow-up history.">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <span className={`badge ${stagePillClass(contact.crm_stages, stageIndex)}`}>
                {contact.crm_stages?.name || 'No stage'}
              </span>
              <div className="flex gap-2">
                <Link to={`/crm/leads/${id}/edit`} className="text-ink-500 hover:text-ink-900">
                  <Pencil size={15} />
                </Link>
                {isAdmin && (
                  <button onClick={handleDelete} className="text-rose-500 hover:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            <h3 className="font-semibold text-ink-900">{contact.parent_name}</h3>
            {contact.parent_contact && (
              <p className="text-sm text-ink-500 flex items-center gap-1.5 mt-1">
                <Phone size={13} /> {contact.parent_contact}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-sand-100 space-y-2 text-sm">
              <Row label="Student" value={contact.student_name} />
              <Row label="Year" value={contact.student_year} />
              <Row label="School" value={contact.school} />
              <Row label="Service" value={contact.service_interested} />
              <Row label="Lead source" value={contact.lead_source} />
              <Row label="PIC" value={contact.profiles?.full_name} />
              <Row label="First contact" value={formatDate(contact.first_contact_date)} />
              <Row label="Next follow-up" value={formatDate(contact.next_followup_date)} />
            </div>

            {contact.notes && (
              <div className="mt-4 pt-4 border-t border-sand-100">
                <p className="text-xs font-medium text-ink-500 mb-1">Notes</p>
                <p className="text-sm text-ink-700 whitespace-pre-wrap">{contact.notes}</p>
              </div>
            )}
          </div>

          <div className="card p-5">
            <p className="text-xs font-medium text-ink-500 mb-2">Move to stage</p>
            <div className="flex flex-wrap gap-2">
              {stages.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => changeStage(s.id)}
                  className={`badge ${stagePillClass(s, i)} ${
                    s.id === contact.stage_id ? 'ring-2 ring-offset-1 ring-brand-500' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card p-5 mb-4">
            <p className="text-sm font-semibold text-ink-900 mb-3">Log a follow-up</p>
            <form onSubmit={addFollowup} className="space-y-3">
              {error && <Alert tone="rose">{error}</Alert>}
              <div className="flex gap-3">
                <input
                  type="date"
                  className="field-input w-40"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
                <input
                  className="field-input flex-1"
                  placeholder="What happened / what's next?"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <button type="submit" disabled={savingNote} className="btn-primary shrink-0">
                  <Plus size={15} /> Log
                </button>
              </div>
            </form>
          </div>

          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3">
            Follow-up history
          </h3>
          {followups.length === 0 ? (
            <EmptyState
              icon={SchoolIcon}
              title="No follow-ups logged yet"
              description="Add the first entry above to start tracking this lead's history."
            />
          ) : (
            <div className="card divide-y divide-sand-100">
              {followups.map((f) => (
                <div key={f.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-900">{formatDate(f.followup_date)}</p>
                    <p className="text-xs text-ink-500">{f.profiles?.full_name}</p>
                  </div>
                  <p className="text-sm text-ink-700 mt-1">{f.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900 text-right">{value || '—'}</span>
    </div>
  )
}
