import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Alert } from '../components/UI'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  const from = location.state?.from?.pathname || '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: signInError } = await signIn(email, password)
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    navigate(from, { replace: true })
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setResetError('')
    if (!resetEmail.trim()) {
      setResetError('Enter your email first.')
      return
    }
    setResetSending(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetSending(false)
    if (resetErr) {
      setResetError(resetErr.message)
      return
    }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex bg-ink-900">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white bg-gradient-to-br from-ink-900 via-ink-900 to-brand-700">
        <div>
          <p className="font-display text-2xl font-semibold">ALL 10S EDU</p>
          <p className="text-white/50 text-sm mt-1">十习生教育中心</p>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-3xl font-medium leading-snug">
            Leave and claims,
            <br />
            handled in one place.
          </h2>
          <p className="mt-3 text-white/60 text-sm leading-relaxed">
            Apply for leave, submit expense claims, and track approvals — built for the ALL 10S
            team.
          </p>
        </div>
        <p className="text-xs text-white/30">© {new Date().getFullYear()} ALL 10S EDU</p>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center bg-sand-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="font-display text-xl font-semibold text-ink-900">ALL 10S EDU</p>
            <p className="text-ink-500 text-sm">Leave &amp; Claims</p>
          </div>

          {!showForgot ? (
            <>
              <h1 className="text-2xl font-semibold text-ink-900 mb-1">Welcome back</h1>
              <p className="text-sm text-ink-500 mb-6">Sign in to continue to your dashboard.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <Alert tone="rose">{error}</Alert>}
                <div>
                  <label className="field-label" htmlFor="email">
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    className="field-input"
                    placeholder="you@all10sedu.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    className="field-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <p className="mt-6 text-xs text-ink-500">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true)
                    setResetEmail(email)
                    setResetSent(false)
                    setResetError('')
                  }}
                  className="text-brand-600 hover:underline font-medium"
                >
                  Forgot your password?
                </button>{' '}
                Don't have an account yet? Ask your admin to set one up for you.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-ink-900 mb-1">Reset your password</h1>
              <p className="text-sm text-ink-500 mb-6">
                Enter your email and we'll send you a link to set a new password.
              </p>

              {resetSent ? (
                <Alert tone="brand">
                  If an account exists for that email, a reset link is on its way — check your
                  inbox (and spam folder).
                </Alert>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  {resetError && <Alert tone="rose">{resetError}</Alert>}
                  <div>
                    <label className="field-label" htmlFor="reset-email">
                      Work email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      className="field-input"
                      placeholder="you@all10sedu.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <button type="submit" disabled={resetSending} className="btn-primary w-full">
                    {resetSending ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="mt-6 text-xs text-brand-600 hover:underline font-medium"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}