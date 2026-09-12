import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert } from '../components/UI'

export default function ClaimApply() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [claimTypes, setClaimTypes] = useState([])
  const [claimTypeId, setClaimTypeId] = useState('')
  const [claimDate, setClaimDate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase
      .from('claim_types')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setClaimTypes(data || [])
        if (data?.length) setClaimTypeId(data[0].id)
      })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid claim amount.')
      return
    }
    if (!file) {
      setError('Please attach a receipt or supporting document.')
      return
    }

    setSubmitting(true)

    const path = `${profile.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('claim-attachments')
      .upload(path, file)
    if (uploadError) {
      setError(`Attachment upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }
    const { data: urlData } = supabase.storage.from('claim-attachments').getPublicUrl(path)

    const { error: insertError } = await supabase.from('claims').insert({
      profile_id: profile.id,
      claim_type_id: claimTypeId,
      claim_date: claimDate,
      amount: Number(amount),
      description,
      status: 'pending',
      attachment_url: urlData.publicUrl,
    })

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => navigate('/claims'), 900)
  }

  return (
    <AppLayout title="New claim" subtitle="Submit an expense claim with receipt for approval.">
      <div className="max-w-xl">
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {error && <Alert tone="rose">{error}</Alert>}
          {success && <Alert tone="brand">Claim submitted. Redirecting…</Alert>}

          <div>
            <label className="field-label">Claim type</label>
            <select
              className="field-input"
              value={claimTypeId}
              onChange={(e) => setClaimTypeId(e.target.value)}
              required
            >
              {claimTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Expense date</label>
              <input
                type="date"
                className="field-input"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">Amount (RM)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea
              className="field-input min-h-[90px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this claim for?"
              required
            />
          </div>

          <div>
            <label className="field-label">Receipt / supporting document (required)</label>
            <input
              type="file"
              className="field-input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting…' : 'Submit claim'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/claims')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
