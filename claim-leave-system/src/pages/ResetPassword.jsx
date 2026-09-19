import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Alert } from '../components/UI'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Clicking the emailed link establishes a temporary "recovery" session.
    // Give Supabase a moment to process the URL fragment before checking.
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setReady(Boolean(data.session))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) setReady(true)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="font-display text-xl font-semibold text-ink-900">ALL10S ERP</p>
          <p className="text-sm text-ink-500 mt-1">Set a new password</p>
        </div>

        <div className="card p-6">
          {!ready ? (
            <p className="text-sm text-ink-500">Verifying your reset link…</p>
          ) : done ? (
            <Alert tone="brand">Password updated — taking you to your dashboard…</Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <Alert tone="rose">{error}</Alert>}
              <div>
                <label className="field-label">New password</label>
                <input
                  type="password"
                  required
                  className="field-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Confirm new password</label>
                <input
                  type="password"
                  required
                  className="field-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-ink-500 text-center mt-4">
          This link only works once and expires after a short time. If it's expired, go back to
          the login page and request a new one.
        </p>
      </div>
    </div>
  )
}