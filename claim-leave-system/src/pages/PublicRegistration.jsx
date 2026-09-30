import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, createSignupClient } from '../lib/supabaseClient'
import { Alert } from '../components/UI'

export default function PublicRegistration() {
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org')
  const isPreview = searchParams.get('preview') === '1'

  const [parentFullName, setParentFullName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [password, setPassword] = useState('')
  const [studentFullName, setStudentFullName] = useState('')
  const [customAnswers, setCustomAnswers] = useState({})
  const [uploadingFields, setUploadingFields] = useState({})
  const [parentFields, setParentFields] = useState([])
  const [studentFields, setStudentFields] = useState([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isPreview) {
      setError('This is a preview — submission is disabled here. Use the real registration link to actually submit.')
      return
    }

    if (!parentFullName.trim() || !parentEmail.trim() || password.length < 6) {
      setError('Fill in your name, email, and a password of at least 6 characters.')
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

    // Create the parent's login account right away (so the password is
    // stored securely by Supabase) — but nothing is usable in the portal
    // until an admin approves the registration below.
    const signupClient = createSignupClient()
    const { data: signupData, error: signupError } = await signupClient.auth.signUp({
      email: parentEmail.trim(),
      password,
    })
    if (signupError) {
      setSubmitting(false)
      setError(signupError.message)
      return
    }
    const userId = signupData.user?.id
    if (!userId) {
      setSubmitting(false)
      setError('Could not create your login. Please try again.')
      return
    }

    const { error: insertError } = await supabase.from('registration_requests').insert({
      org_id: orgId,
      parent_full_name: parentFullName.trim(),
      parent_email: parentEmail.trim(),
      parent_phone: parentPhone || null,
      parent_auth_user_id: userId,
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
          <p className="text-sm text-ink-700">
            Thanks! Your registration is now pending review. Once approved, you can sign in at the parent portal
            using the email and password you just set.
          </p>
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

              <div>
                <h2 className="text-sm font-semibold text-ink-900 mb-3">Parent / Guardian Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="field-label">Full name</label>
                    <input className="field-input" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Email</label>
                    <input type="email" className="field-input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Phone number</label>
                    <input className="field-input" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="012-345 6789" />
                  </div>
                  <div>
                    <label className="field-label">Set a password for your portal login</label>
                    <input
                      type="password"
                      className="field-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                  {parentFields.map((f) => (
                    <DynamicField key={f.id} field={f} value={customAnswers[f.id]} onChange={(v) => setAnswer(f.id, v)} onFileSelect={(file) => handleFileChange(f.id, file)} uploading={uploadingFields[f.id]} />
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
                    <DynamicField key={f.id} field={f} value={customAnswers[f.id]} onChange={(v) => setAnswer(f.id, v)} onFileSelect={(file) => handleFileChange(f.id, file)} uploading={uploadingFields[f.id]} />
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
