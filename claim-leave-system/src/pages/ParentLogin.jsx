import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { usePortalAuth } from '../context/PortalAuthContext'

// Modes:
//   password      – normal email + password sign-in
//   request-code  – first login or forgot password: enter email, we send a code
//   enter-code    – enter the code from the email
//   set-password  – choose a password (first time, or reset)
export default function ParentLogin() {
  const { signIn, refreshAccount } = usePortalAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  function goToMode(next) {
    setMode(next)
    setError('')
    setInfo('')
  }

  async function handlePasswordLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: signInError } = await signIn(email.trim().toLowerCase(), password)
    setLoading(false)
    if (signInError) {
      setError('Email or password is incorrect. First time here, or forgot your password? Use “Get a code by email” below.')
      return
    }
    navigate('/parent-portal')
  }

  async function handleRequestCode(e) {
    e.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      setError('Enter the email you registered with.')
      return
    }
    setLoading(true)

    const { data: status, error: statusError } = await supabase.rpc('get_parent_registration_status', { p_email: em })
    if (statusError) {
      setLoading(false)
      setError('Something went wrong. Please try again.')
      return
    }
    if (status === 'none') {
      setLoading(false)
      setError("We couldn't find a registration for this email. Check the email you used, or register first.")
      return
    }
    if (status === 'pending') {
      setLoading(false)
      setError("Your registration is still pending review. You'll be able to sign in once the centre approves it.")
      return
    }
    if (status === 'rejected') {
      setLoading(false)
      setError('Your registration was not approved. Please contact the centre.')
      return
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: em,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setEmail(em)
    setCode('')
    setMode('enter-code')
    setInfo(`We've emailed a code to ${em}. It can take a minute to arrive — check your spam folder too.`)
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setError('')
    const token = code.trim()
    if (!token) {
      setError('Enter the code from the email.')
      return
    }
    setLoading(true)

    let { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (verifyError) {
      // First-ever login creates the account, which some setups verify as a sign-up code.
      const retry = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
      verifyError = retry.error
    }
    if (verifyError) {
      setLoading(false)
      setError('That code is incorrect or has expired. Check it and try again, or request a new one.')
      return
    }

    const { data: claimedId, error: claimError } = await supabase.rpc('claim_parent_account')
    if (claimError || !claimedId) {
      setLoading(false)
      setError("We couldn't link this email to an approved registration. Please contact the centre.")
      return
    }

    await refreshAccount()
    setLoading(false)
    setMode('set-password')
    setInfo('Email verified. Now choose a password for next time.')
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError('Your password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.")
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    navigate('/parent-portal')
  }

  const titles = {
    password: ['Parent Portal', "Sign in to view your child's updates."],
    'request-code': ['Get a code by email', 'For your first login, or if you forgot your password.'],
    'enter-code': ['Enter your code', 'Type the code we emailed you.'],
    'set-password': ['Choose a password', "You'll use this to sign in from now on."],
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-ink-900 mb-1">{titles[mode][0]}</h1>
        <p className="text-sm text-ink-500 mb-6">{titles[mode][1]}</p>

        {error && <div className="mb-4 text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</div>}
        {info && !error && <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">{info}</div>}

        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="field-label">Email</label>
              <input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => goToMode('request-code')} className="w-full text-center text-sm text-brand-600 hover:underline">
              First time here, or forgot your password? Get a code by email
            </button>
          </form>
        )}

        {mode === 'request-code' && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="field-label">Email you registered with</label>
              <input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send me a code'}
            </button>
            <button type="button" onClick={() => goToMode('password')} className="w-full text-center text-sm text-ink-500 hover:underline">
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'enter-code' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="field-label">Code</label>
              <input
                className="field-input tracking-widest text-center text-lg"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Checking…' : 'Verify'}
            </button>
            <button type="button" onClick={() => goToMode('request-code')} className="w-full text-center text-sm text-ink-500 hover:underline">
              Didn't get it? Send a new code
            </button>
          </form>
        )}

        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="field-label">New password</label>
              <input
                type="password"
                className="field-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="field-label">Confirm password</label>
              <input type="password" className="field-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Saving…' : 'Save password and continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
