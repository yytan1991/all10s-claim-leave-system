import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert } from '../components/UI'
import { countWorkingDays } from '../lib/helpers'

export default function LeaveApply() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('leave_types')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name')
      .then(({ data }) => {
        setLeaveTypes(data || [])
        if (data?.length) setLeaveTypeId(data[0].id)
      })
  }, [profile?.org_id])

  const days = countWorkingDays(startDate, endDate)
  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!startDate || !endDate) {
      setError('Please select a start and end date.')
      return
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before the start date.')
      return
    }
    if (selectedType?.requires_attachment && !file) {
      setError(`${selectedType.name} requires a supporting document.`)
      return
    }

    setSubmitting(true)
    let attachmentUrl = null

    if (file) {
      const path = `${profile.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('leave-attachments')
        .upload(path, file)
      if (uploadError) {
        setError(`Attachment upload failed: ${uploadError.message}`)
        setSubmitting(false)
        return
      }
      const { data: urlData } = supabase.storage.from('leave-attachments').getPublicUrl(path)
      attachmentUrl = urlData.publicUrl
    }

    const { error: insertError } = await supabase.from('leave_applications').insert({
      profile_id: profile.id,
      org_id: profile.org_id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      days,
      reason,
      status: 'pending',
      attachment_url: attachmentUrl,
    })

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => navigate('/leave'), 900)
  }

  return (
    <AppLayout title="Apply for leave" subtitle="Submit a new leave application for approval.">
      <div className="max-w-xl">
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {error && <Alert tone="rose">{error}</Alert>}
          {success && <Alert tone="brand">Application submitted. Redirecting…</Alert>}

          <div>
            <label className="field-label">Leave type</label>
            <select
              className="field-input"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              required
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Start date</label>
              <input
                type="date"
                className="field-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">End date</label>
              <input
                type="date"
                className="field-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {startDate && endDate && (
            <p className="text-sm text-ink-500">
              This covers <span className="font-medium text-ink-900">{days}</span> working day
              {days === 1 ? '' : 's'} (weekends excluded).
            </p>
          )}

          <div>
            <label className="field-label">Reason</label>
            <textarea
              className="field-input min-h-[90px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let your manager know the reason for this leave."
              required
            />
          </div>

          <div>
            <label className="field-label">
              Supporting document {selectedType?.requires_attachment ? '(required)' : '(optional)'}
            </label>
            <input
              type="file"
              className="field-input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/leave')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
