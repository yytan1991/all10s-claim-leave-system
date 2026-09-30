import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortalAuth } from '../context/PortalAuthContext'

export default function StudentLogin() {
  const { signIn } = usePortalAuth()
  const navigate = useNavigate()
  const [loginCode, setLoginCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!loginCode.trim() || !pin.trim()) {
      setError('Enter your Login Code and PIN.')
      return
    }
    setLoading(true)
    const syntheticEmail = `${loginCode.trim().toLowerCase()}@student.portal.internal`
    const { error: signInError } = await signIn(syntheticEmail, pin.trim())
    setLoading(false)
    if (signInError) {
      setError('Login Code or PIN is incorrect.')
      return
    }
    navigate('/student-portal')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-ink-900 mb-1">Student Portal</h1>
        <p className="text-sm text-ink-500 mb-6">Enter your Login Code and PIN.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="field-label">Login Code</label>
            <input
              className="field-input uppercase"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              placeholder="e.g. AB12CD"
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label className="field-label">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="field-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="6-digit PIN"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
