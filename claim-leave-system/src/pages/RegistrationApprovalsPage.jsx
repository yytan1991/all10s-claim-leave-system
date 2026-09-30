import { useEffect, useState } from 'react'
import { Check, X, Copy } from 'lucide-react'
import { supabase, createSignupClient } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { formatDate } from '../lib/helpers'

const LOGIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I, etc.)

function generateLoginCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += LOGIN_CODE_CHARS[Math.floor(Math.random() * LOGIN_CODE_CHARS.length)]
  return code
}
function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function RegistrationApprovalsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [fieldLabels, setFieldLabels] = useState({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')
  const [rejectingRequest, setRejectingRequest] = useState(null)
  const [approvedCredentials, setApprovedCredentials] = useState(null)

  async function load() {
    setLoading(true)
    const { data: fieldData } = await supabase
      .from('registration_form_fields')
      .select('id, label, field_type')
      .eq('org_id', profile.org_id)
    const labelMap = {}
    ;(fieldData || []).forEach((f) => {
      labelMap[f.id] = { label: f.label, fieldType: f.field_type }
    })
    setFieldLabels(labelMap)

    const { data } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  const visible = requests.filter((r) => r.status === tab)

  async function handleApprove(request) {
    setProcessingId(request.id)
    setError('')

    const { data: studentRow, error: studentError } = await supabase
      .from('students')
      .insert({
        org_id: request.org_id,
        full_name: request.student_full_name,
        parent_name: request.parent_full_name,
        parent_contact: request.parent_phone,
        created_by: profile.id,
      })
      .select()
      .single()
    if (studentError) {
      setError(studentError.message)
      setProcessingId(null)
      return
    }

    const { data: parentAccountRow, error: parentError } = await supabase
      .from('parent_accounts')
      .insert({
        user_id: request.parent_auth_user_id,
        org_id: request.org_id,
        full_name: request.parent_full_name,
        phone: request.parent_phone,
      })
      .select()
      .single()
    if (parentError) {
      setError(parentError.message)
      setProcessingId(null)
      return
    }

    await supabase.from('parent_student_links').insert({
      parent_account_id: parentAccountRow.id,
      student_id: studentRow.id,
    })

    const loginCode = generateLoginCode()
    const pin = generatePin()
    const syntheticEmail = `${loginCode.toLowerCase()}@student.portal.internal`

    const signupClient = createSignupClient()
    const { data: studentAuthData, error: studentAuthError } = await signupClient.auth.signUp({
      email: syntheticEmail,
      password: pin,
    })
    if (studentAuthError) {
      setError(`Registration approved, but creating the student's login failed: ${studentAuthError.message}`)
      setProcessingId(null)
      return
    }

    await supabase.from('student_accounts').insert({
      user_id: studentAuthData.user.id,
      org_id: request.org_id,
      student_id: studentRow.id,
      login_code: loginCode,
    })

    await supabase
      .from('registration_requests')
      .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', request.id)

    setProcessingId(null)
    setApprovedCredentials({ studentName: request.student_full_name, loginCode, pin })
    load()
  }

  async function handleReject(request, reason) {
    setProcessingId(request.id)
    await supabase
      .from('registration_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason || null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    setProcessingId(null)
    setRejectingRequest(null)
    load()
  }

  return (
    <AppLayout title="Registration Approvals" subtitle="Review parent-submitted registrations before they can access the portal.">
      <div className="mb-6 flex gap-2 border-b border-sand-200">
        {[
          { key: 'pending', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
            {t.key === 'pending' && requests.filter((r) => r.status === 'pending').length > 0 && (
              <span className="ml-1.5 badge-pending">{requests.filter((r) => r.status === 'pending').length}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${tab} registrations`} description="Nothing to show here right now." />
      ) : (
        <div className="space-y-4">
          {visible.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Parent</p>
                  <p className="text-sm font-medium text-ink-900">{r.parent_full_name}</p>
                  <p className="text-xs text-ink-500">{r.parent_email}</p>
                  {r.parent_phone && <p className="text-xs text-ink-500">{r.parent_phone}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Student</p>
                  <p className="text-sm font-medium text-ink-900">{r.student_full_name}</p>
                  {r.student_dob && <p className="text-xs text-ink-500">DOB: {formatDate(r.student_dob)}</p>}
                  {r.student_notes && <p className="text-xs text-ink-500 mt-1">{r.student_notes}</p>}
                  {r.custom_answers &&
                    Object.entries(r.custom_answers)
                      .filter(([, v]) => v)
                      .map(([fieldId, v]) => {
                        const fieldInfo = fieldLabels[fieldId]
                        const questionLabel = fieldInfo?.label || 'Question'
                        if (fieldInfo?.fieldType === 'image') {
                          return (
                            <div key={fieldId} className="mt-2">
                              <p className="text-xs text-ink-500 mb-1">{questionLabel}:</p>
                              <a href={v} target="_blank" rel="noopener noreferrer">
                                <img src={v} alt={questionLabel} className="h-20 w-20 object-cover rounded-md border border-sand-200" />
                              </a>
                            </div>
                          )
                        }
                        return (
                          <p key={fieldId} className="text-xs text-ink-600 mt-1">
                            <span className="text-ink-500">{questionLabel}:</span> {v}
                          </p>
                        )
                      })}
                </div>
              </div>
              <p className="text-xs text-ink-400 mb-3">Submitted {formatDate(r.created_at?.slice(0, 10))}</p>

              {r.status === 'rejected' && r.rejection_reason && (
                <p className="text-xs text-rose-600 mb-3">Reason: {r.rejection_reason}</p>
              )}

              {r.status === 'pending' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(r)}
                    disabled={processingId === r.id}
                    className="btn-primary text-sm"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => setRejectingRequest(r)}
                    disabled={processingId === r.id}
                    className="text-rose-600 border border-rose-200 hover:bg-rose-50 text-sm rounded-md px-3 py-1.5 font-medium inline-flex items-center gap-1.5"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectingRequest && (
        <RejectModal
          request={rejectingRequest}
          onClose={() => setRejectingRequest(null)}
          onConfirm={(reason) => handleReject(rejectingRequest, reason)}
        />
      )}

      {approvedCredentials && (
        <ApprovedCredentialsModal credentials={approvedCredentials} onClose={() => setApprovedCredentials(null)} />
      )}
    </AppLayout>
  )
}

function RejectModal({ request, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <h3 className="font-semibold text-ink-900 mb-4">Reject registration — {request.student_full_name}</h3>
        <label className="field-label">Reason (optional, shown to no one automatically yet)</label>
        <textarea className="field-input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => onConfirm(reason)}
            className="text-rose-600 border border-rose-200 hover:bg-rose-50 text-sm rounded-md px-3 py-1.5 font-medium"
          >
            Confirm reject
          </button>
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function ApprovedCredentialsModal({ credentials, onClose }) {
  function copyAll() {
    navigator.clipboard.writeText(`Login Code: ${credentials.loginCode}\nPIN: ${credentials.pin}`)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <h3 className="font-semibold text-ink-900 mb-2">Registration approved</h3>
        <p className="text-sm text-ink-500 mb-4">
          Give these to <span className="font-medium text-ink-700">{credentials.studentName}</span> to log into the
          student portal. This won't be shown again — copy it down now.
        </p>
        <div className="bg-sand-50 rounded-md p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-ink-500">Login Code</span>
            <span className="text-sm font-mono font-semibold text-ink-900">{credentials.loginCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-ink-500">PIN</span>
            <span className="text-sm font-mono font-semibold text-ink-900">{credentials.pin}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={copyAll} className="btn-secondary text-sm">
            <Copy size={14} /> Copy both
          </button>
          <button onClick={onClose} className="btn-primary text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
