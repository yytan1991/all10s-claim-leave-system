import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert } from '../components/UI'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
            Forgot your password or don't have an account yet? Ask your admin to set one up for
            you.
          </p>
        </div>
      </div>
    </div>
  )
}
