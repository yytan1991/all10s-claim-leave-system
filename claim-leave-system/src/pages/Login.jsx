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

  const wiiInput =
    'w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-950 ' +
    'placeholder:text-red-900/30 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-500'
  const wiiLabel = 'block text-sm font-medium text-red-900 mb-1.5'
  const wiiButton =
    'w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ' +
    'bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const wiiLink = 'text-brand-600 hover:underline font-medium'

  return (
    <div className="min-h-screen flex bg-chrome">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white bg-chrome">
        <div>
          <p className="font-display text-2xl font-semibold">WiiTeam</p>
          <p className="text-white/70 text-sm mt-1">One System, All Connected</p>
        </div>
        <div className="max-w-md">
          <h2 className="font-body text-3xl font-medium leading-snug text-white">
            Perfect All-in-One system for SMEs
          </h2>
        </div>
        <p className="text-xs text-white/40">© {new Date().getFullYear()} WiiTeam</p>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="font-display text-xl font-semibold text-red-800">WiiTeam</p>
            <p className="text-red-900/60 text-sm">One System, All Connected</p>
          </div>

          {!showForgot ? (
            <>
              <h1 className="text-2xl font-semibold text-red-900 mb-1">Welcome back</h1>
              <p className="text-sm text-red-900/60 mb-6">Sign in to continue to your dashboard.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <Alert tone="rose">{error}</Alert>}
                <div>
                  <label className={wiiLabel} htmlFor="email">
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    className={wiiInput}
                    placeholder="you@wiiteam.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className={wiiLabel} htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    className={wiiInput}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className={wiiButton}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <p className="mt-6 text-xs text-red-900/60">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true)
                    setResetEmail(email)
                    setResetSent(false)
                    setResetError('')
                  }}
                  className={wiiLink}
                >
                  Forgot your password?
                </button>{' '}
                Don't have an account yet? Ask your admin to set one up for you.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-red-900 mb-1">Reset your password</h1>
              <p className="text-sm text-red-900/60 mb-6">
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
                    <label className={wiiLabel} htmlFor="reset-email">
                      Work email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      className={wiiInput}
                      placeholder="you@wiiteam.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <button type="submit" disabled={resetSending} className={wiiButton}>
                    {resetSending ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}

              <button type="button" onClick={() => setShowForgot(false)} className={`mt-6 text-xs ${wiiLink}`}>
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
