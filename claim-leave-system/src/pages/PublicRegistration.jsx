import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Alert } from '../components/UI'

export default function PublicRegistration() {
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org')
  const isPreview = searchParams.get('preview') === '1'

  const [parentFullName, setParentFullName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [studentFullName, setStudentFullName] = useState('')
  const [customAnswers, setCustomAnswers] = useState({})
  const [uploadingFields, setUploadingFields] = useState({})
  const [parentFields, setParentFields] = useState([])
  const [studentFields, setStudentFields] = useState([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Returning-parent detection (second child etc.)
  const [checkedEmail, setCheckedEmail] = useState('')
  const [matchPrompt, setMatchPrompt] = useState(null)
  const [prefillNote, setPrefillNote] = useState('')

  useEffect(() => {
    if (!orgId) {
      setLoadingFields(false)
      return
    }
    supabase
      .from('registration_form_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('section')
      .order('sort_order')
      .then(({ data }) => {
        setParentFields((data || []).filter((f) => f.section === 'parent'))
        setStudentFields((data || []).filter((f) => f.section === 'student'))
        setLoadingFields(false)
      })
  }, [orgId])

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
        <div className="card max-w-sm p-6 text-center">
          <p className="text-sm text-ink-700">
            This registration link is missing its centre reference. Please ask the centre for the correct link.
          </p>
        </div>
      </div>
    )
  }

  function setAnswer(fieldId, value) {
    setCustomAnswers((prev) => ({ ...prev, [fieldId]: value }))
  }

  async function handleFileChange(fieldId, file) {
    if (!file) return
    setError('')
    setUploadingFields((prev) => ({ ...prev, [fieldId]: true }))
    const path = `${orgId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('registration-attachments').upload(path, file)
    setUploadingFields((prev) => ({ ...prev, [fieldId]: false }))
    if (uploadError) {
      setError(`Could not upload photo: ${uploadError.message}`)
      return
    }
    const { data: urlData } = supabase.storage.from('registration-attachments').getPublicUrl(path)
    setAnswer(fieldId, urlData.publicUrl)
  }

  // When the parent finishes typing their email, check whether we already know them.
  async function handleEmailBlur() {
    const email = parentEmail.trim().toLowerCase()
    if (isPreview || !email || !email.includes('@') || checkedEmail === email) return
    setCheckedEmail(email)
    const { data } = await supabase.rpc('lookup_returning_parent', { p_org_id: orgId, p_email: email })
    const match = Array.isArray(data) ? data[0] : data
    if (match) setMatchPrompt(match)
  }

  function acceptMatch() {
    setParentFullName(matchPrompt.out_full_name || parentFullName)
    setParentPhone(matchPrompt.out_phone || parentPhone)
    setCustomAnswers((prev) => ({ ...prev, ...(matchPrompt.out_parent_answers || {}) }))
    setPrefillNote(
      matchPrompt.out_has_account
        ? 'Welcome back! Your details are filled in. This child will be added to your existing portal login once approved.'
        : 'Welcome back! Your details are filled in — just add your child’s details below.'
    )
    setMatchPrompt(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isPreview) {
      setError('This is a preview — submission is disabled here. Use the real registration link to actually submit.')
      return
    }

    if (!parentFullName.trim() || !parentEmail.trim() || !parentEmail.includes('@')) {
      setError('Fill in your name and a valid email.')
      return
    }
    if (!studentFullName.trim()) {
      setError("Please enter your child's name.")
      return
    }
    for (const f of [...parentFields, ...studentFields]) {
      if (f.required && !customAnswers[f.id]?.toString().trim()) {
        setError(`Please answer: ${f.label}`)
        return
      }
    }

    setSubmitting(true)
    const { error: insertError } = await supabase.from('registration_requests').insert({
      org_id: orgId,
      parent_full_name: parentFullName.trim(),
      parent_email: parentEmail.trim().toLowerCase(),
      parent_phone: parentPhone || null,
      student_full_name: studentFullName.trim(),
      custom_answers: customAnswers,
    })
    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-ink-900 mb-2">Registration submitted</h1>
          <p className="text-sm text-ink-700 mb-4">
            Thanks! Your registration is now pending review. Once it's approved, open the parent portal and choose
            “Get a code by email” using the email you just registered with. You'll set your own password the first time.
          </p>
          <a href="/parent-login" className="btn-secondary text-sm">
            Go to parent portal
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand-50 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="card p-6 sm:p-8">
          {isPreview && (
            <div className="mb-4 bg-amber-50 text-amber-700 text-sm rounded-md px-3 py-2">
              Preview mode — this is exactly what parents will see. Submission is disabled here.
            </div>
          )}
          <h1 className="text-xl font-semibold text-ink-900 mb-1">Student Registration</h1>
          <p className="text-sm text-ink-500 mb-6">
            Fill in your details and your child's details below. Our team will review and approve your registration.
          </p>

          {loadingFields ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && <Alert tone="rose">{error}</Alert>}
              {prefillNote && <Alert tone="brand">{prefillNote}</Alert>}

              <div>
                <h2 className="text-sm font-semibold text-ink-900 mb-3">Parent / Guardian Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="field-label">Email</label>
                    <input
                      type="email"
                      className="field-input"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      onBlur={handleEmailBlur}
                    />
                    <p className="text-[11px] text-ink-500 mt-1">
                      This is what you'll use to sign in to the parent portal.
                    </p>
                  </div>
                  <div>
                    <label className="field-label">Full name</label>
                    <input className="field-input" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Phone number</label>
                    <input className="field-input" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="012-345 6789" />
                  </div>
                  {parentFields.map((f) => (
                    <DynamicField
                      key={f.id}
                      field={f}
                      value={customAnswers[f.id]}
                      onChange={(v) => setAnswer(f.id, v)}
                      onFileSelect={(file) => handleFileChange(f.id, file)}
                      uploading={uploadingFields[f.id]}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-ink-900 mb-3">Student Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="field-label">Student's full name</label>
                    <input className="field-input" value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} />
                  </div>
                  {studentFields.map((f) => (
                    <DynamicField
                      key={f.id}
                      field={f}
                      value={customAnswers[f.id]}
                      onChange={(v) => setAnswer(f.id, v)}
                      onFileSelect={(file) => handleFileChange(f.id, file)}
                      uploading={uploadingFields[f.id]}
                    />
                  ))}
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Submitting…' : isPreview ? 'Submit registration (disabled in preview)' : 'Submit registration'}
              </button>
            </form>
          )}
        </div>
      </div>

      {matchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="font-semibold text-ink-900 mb-2">We found your details</h3>
            <p className="text-sm text-ink-500 mb-4">
              This email has registered with us before. Use the same details so you only need to fill in your child's information?
            </p>
            <div className="bg-sand-50 rounded-md p-3 mb-4 text-sm text-ink-700 space-y-1">
              <p>
                <span className="text-ink-500">Name:</span> {matchPrompt.out_full_name}
              </p>
              {matchPrompt.out_phone && (
                <p>
                  <span className="text-ink-500">Phone:</span> {matchPrompt.out_phone}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={acceptMatch} className="btn-primary text-sm">
                Yes, use these details
              </button>
              <button onClick={() => setMatchPrompt(null)} className="btn-secondary text-sm">
                No, enter manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DynamicField({ field, value, onChange, onFileSelect, uploading }) {
  const label = (
    <label className="field-label">
      {field.label} {field.required && <span className="text-rose-500">*</span>}
    </label>
  )

  if (field.field_type === 'image') {
    return (
      <div>
        {label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="field-input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
          onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
        />
        <p className="text-xs text-ink-500 mt-1">On a phone, this lets you take a photo directly or choose one from your gallery.</p>
        {uploading && <p className="text-xs text-ink-500 mt-1">Uploading…</p>}
        {value && !uploading && (
          <div className="mt-2 flex items-center gap-2">
            <img src={value} alt="Uploaded preview" className="h-16 w-16 object-cover rounded-md border border-sand-200" />
            <span className="text-xs text-brand-600">Uploaded</span>
          </div>
        )}
      </div>
    )
  }
  if (field.field_type === 'textarea') {
    return (
      <div>
        {label}
        <textarea className="field-input min-h-[70px]" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }
  if (field.field_type === 'select') {
    return (
      <div>
        {label}
        <select className="field-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <div>
      {label}
      <input
        type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
        className="field-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
