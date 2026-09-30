import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Users2, Copy } from 'lucide-react'
import { supabase, createSignupClient } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

const LOGIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateLoginCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += LOGIN_CODE_CHARS[Math.floor(Math.random() * LOGIN_CODE_CHARS.length)]
  return code
}
function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function ParentStudentAccountsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('parents')
  const [students, setStudents] = useState([])
  const [parentAccounts, setParentAccounts] = useState([])
  const [studentAccounts, setStudentAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [creatingStudent, setCreatingStudent] = useState(false)
  const [newCredentials, setNewCredentials] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: studentData }, { data: parentAccData }, { data: studentAccData }] = await Promise.all([
      supabase.from('students').select('id, full_name').eq('org_id', profile.org_id).order('full_name'),
      supabase
        .from('parent_accounts')
        .select('*, parent_student_links(students(id, full_name))')
        .eq('org_id', profile.org_id)
        .order('full_name'),
      supabase
        .from('student_accounts')
        .select('*, students(full_name)')
        .eq('org_id', profile.org_id),
    ])
    setStudents(studentData || [])
    setParentAccounts(parentAccData || [])
    setStudentAccounts(studentAccData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function deleteParentAccount(id) {
    if (!confirm('Remove this parent login? They will no longer be able to sign in.')) return
    await supabase.from('parent_accounts').delete().eq('id', id)
    load()
  }

  async function deleteStudentAccount(id) {
    if (!confirm('Remove this student login? They will no longer be able to sign in.')) return
    await supabase.from('student_accounts').delete().eq('id', id)
    load()
  }

  const studentsWithoutLogin = students.filter((s) => !studentAccounts.some((sa) => sa.student_id === s.id))

  return (
    <AppLayout title="Parent & Student Accounts" subtitle="Manage portal logins. Parent accounts are created via Registration Approvals.">
      <div className="mb-6 flex gap-2 border-b border-sand-200">
        {[
          { key: 'parents', label: 'Parent Accounts' },
          { key: 'students', label: 'Student Accounts' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'parents' && (
        <>
          <Alert tone="amber">
            Parent accounts are created automatically when you approve a registration under "Registration Approvals". This tab is for viewing and removing accounts only.
          </Alert>
          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-ink-500">Loading…</p>
            ) : parentAccounts.length === 0 ? (
              <EmptyState icon={Users2} title="No parent accounts yet" description="These appear once you approve a registration." />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium">Linked children</th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {parentAccounts.map((pa) => (
                      <tr key={pa.id}>
                        <td className="px-5 py-3 font-medium text-ink-900">{pa.full_name}</td>
                        <td className="px-5 py-3 text-ink-500">{pa.phone || '—'}</td>
                        <td className="px-5 py-3 text-ink-700">
                          {(pa.parent_student_links || []).map((l) => l.students?.full_name).filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => deleteParentAccount(pa.id)} className="text-rose-500 hover:text-rose-600">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'students' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setCreatingStudent(true)}
              className="btn-primary text-sm"
              disabled={studentsWithoutLogin.length === 0}
            >
              <Plus size={15} /> Create student login
            </button>
          </div>
          {studentsWithoutLogin.length === 0 && students.length > 0 && (
            <Alert tone="amber">Every student already has a login.</Alert>
          )}
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : studentAccounts.length === 0 ? (
            <EmptyState icon={Users2} title="No student accounts yet" description="Create your first one above." />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-sand-100 text-ink-500 text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-5 py-3 font-medium">Login Code</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {studentAccounts.map((sa) => (
                    <tr key={sa.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">{sa.students?.full_name || '—'}</td>
                      <td className="px-5 py-3 text-ink-700 font-mono">{sa.login_code}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => deleteStudentAccount(sa.id)} className="text-rose-500 hover:text-rose-600">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {creatingStudent && (
        <CreateStudentModal
          orgId={profile.org_id}
          students={studentsWithoutLogin}
          onClose={() => setCreatingStudent(false)}
          onCreated={(creds) => {
            setCreatingStudent(false)
            setNewCredentials(creds)
            load()
          }}
        />
      )}

      {newCredentials && <CredentialsModal credentials={newCredentials} onClose={() => setNewCredentials(null)} />}
    </AppLayout>
  )
}

function CreateStudentModal({ orgId, students, onClose, onCreated }) {
  const [studentId, setStudentId] = useState(students[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!studentId) {
      setError('Pick a student.')
      return
    }
    setSaving(true)

    const student = students.find((s) => s.id === studentId)
    const loginCode = generateLoginCode()
    const pin = generatePin()
    const syntheticEmail = `${loginCode.toLowerCase()}@student.portal.internal`

    const signupClient = createSignupClient()
    const { data: signupData, error: signupError } = await signupClient.auth.signUp({
      email: syntheticEmail,
      password: pin,
    })
    if (signupError) {
      setSaving(false)
      setError(signupError.message)
      return
    }
    const userId = signupData.user?.id
    if (!userId) {
      setSaving(false)
      setError('Could not create the login. Please try again.')
      return
    }

    const { error: insertError } = await supabase
      .from('student_accounts')
      .insert({ user_id: userId, org_id: orgId, student_id: studentId, login_code: loginCode })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onCreated({ studentName: student?.full_name, loginCode, pin })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Create student login</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}
          <div>
            <label className="field-label">Student</label>
            <select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-ink-500">A Login Code and PIN will be generated automatically — you'll see them once, to give to the student.</p>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create login'}
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

function CredentialsModal({ credentials, onClose }) {
  function copyAll() {
    navigator.clipboard.writeText(`Login Code: ${credentials.loginCode}\nPIN: ${credentials.pin}`)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <h3 className="font-semibold text-ink-900 mb-2">Login created</h3>
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
