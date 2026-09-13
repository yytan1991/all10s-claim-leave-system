import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert } from '../components/UI'

const LEAD_SOURCES = [
  'Referral',
  'Walk-in',
  'Facebook',
  'Instagram',
  'Google Search',
  'Flyer/Poster',
  'School Event',
  'WhatsApp',
  'Other',
]

export default function CrmLeadForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [stages, setStages] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    parent_name: '',
    parent_contact: '',
    student_name: '',
    student_year: '',
    school: '',
    service_interested: '',
    lead_source: '',
    stage_id: '',
    pic_id: '',
    first_contact_date: new Date().toISOString().slice(0, 10),
    next_followup_date: '',
    notes: '',
  })

  useEffect(() => {
    async function load() {
      const [{ data: stageData }, { data: staffData }] = await Promise.all([
        supabase.from('crm_stages').select('*').order('sort_order'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
      ])
      setStages(stageData || [])
      setStaff(staffData || [])

      if (isEdit) {
        const { data: contact, error: fetchError } = await supabase
          .from('crm_contacts')
          .select('*')
          .eq('id', id)
          .single()
        if (fetchError) {
          setError(fetchError.message)
        } else if (contact) {
          setForm({
            parent_name: contact.parent_name || '',
            parent_contact: contact.parent_contact || '',
            student_name: contact.student_name || '',
            student_year: contact.student_year || '',
            school: contact.school || '',
            service_interested: contact.service_interested || '',
            lead_source: contact.lead_source || '',
            stage_id: contact.stage_id || '',
            pic_id: contact.pic_id || '',
            first_contact_date: contact.first_contact_date || '',
            next_followup_date: contact.next_followup_date || '',
            notes: contact.notes || '',
          })
        }
        setLoading(false)
      } else {
        // Sensible defaults for a brand new lead
        setForm((f) => ({
          ...f,
          stage_id: stageData?.[0]?.id || '',
          pic_id: profile?.id || '',
        }))
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.parent_name.trim()) {
      setError('Parent name is required.')
      return
    }
    setSubmitting(true)

    const payload = {
      ...form,
      student_year: form.student_year || null,
      next_followup_date: form.next_followup_date || null,
      stage_id: form.stage_id || null,
      pic_id: form.pic_id || null,
    }

    let resultError
    if (isEdit) {
      const { error: updateError } = await supabase
        .from('crm_contacts')
        .update(payload)
        .eq('id', id)
      resultError = updateError
    } else {
      const { error: insertError } = await supabase
        .from('crm_contacts')
        .insert({ ...payload, created_by: profile.id })
      resultError = insertError
    }

    setSubmitting(false)
    if (resultError) {
      setError(resultError.message)
      return
    }
    navigate('/crm/leads')
  }

  if (loading) {
    return (
      <AppLayout title={isEdit ? 'Edit lead' : 'New lead'}>
        <p className="text-sm text-ink-500">Loading…</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title={isEdit ? 'Edit lead' : 'New lead'}
      subtitle="Track a parent/student enquiry through your sales pipeline."
    >
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {error && <Alert tone="rose">{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Parent name *</label>
              <input
                className="field-input"
                value={form.parent_name}
                onChange={(e) => update('parent_name', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">Parent contact</label>
              <input
                className="field-input"
                value={form.parent_contact}
                onChange={(e) => update('parent_contact', e.target.value)}
                placeholder="012-345 6789"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="field-label">Student name</label>
              <input
                className="field-input"
                value={form.student_name}
                onChange={(e) => update('student_name', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Student year</label>
              <input
                className="field-input"
                value={form.student_year}
                onChange={(e) => update('student_year', e.target.value)}
                placeholder="e.g. Year 3"
              />
            </div>
            <div>
              <label className="field-label">School</label>
              <input
                className="field-input"
                value={form.school}
                onChange={(e) => update('school', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Service looking for</label>
              <input
                className="field-input"
                value={form.service_interested}
                onChange={(e) => update('service_interested', e.target.value)}
                placeholder="e.g. Primary tuition, daycare"
              />
            </div>
            <div>
              <label className="field-label">Lead source</label>
              <select
                className="field-input"
                value={LEAD_SOURCES.includes(form.lead_source) ? form.lead_source : form.lead_source ? 'Other' : ''}
                onChange={(e) => update('lead_source', e.target.value === 'Other' ? '' : e.target.value)}
              >
                <option value="">— Select —</option>
                {LEAD_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
              {(form.lead_source === '' || !LEAD_SOURCES.includes(form.lead_source)) &&
                form.lead_source !== undefined && (
                  <input
                    className="field-input mt-2"
                    placeholder="Specify source"
                    value={LEAD_SOURCES.includes(form.lead_source) ? '' : form.lead_source}
                    onChange={(e) => update('lead_source', e.target.value)}
                  />
                )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Pipeline stage</label>
              <select
                className="field-input"
                value={form.stage_id}
                onChange={(e) => update('stage_id', e.target.value)}
              >
                <option value="">— Select —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Person in charge (PIC)</label>
              <select
                className="field-input"
                value={form.pic_id}
                onChange={(e) => update('pic_id', e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">First contact date</label>
              <input
                type="date"
                className="field-input"
                value={form.first_contact_date}
                onChange={(e) => update('first_contact_date', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Next follow-up date</label>
              <input
                type="date"
                className="field-input"
                value={form.next_followup_date}
                onChange={(e) => update('next_followup_date', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              className="field-input min-h-[80px]"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Anything else worth remembering about this lead"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add lead'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/crm/leads')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
