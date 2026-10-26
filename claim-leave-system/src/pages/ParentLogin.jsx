import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  const [searchParams] = useSearchParams()
  const arrivedFromEmail = searchParams.get('from') === 'email'

  const [mode, setMode] = useState(arrivedFromEmail ? 'linking' : 'password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  // Remembers whether this parent has already chosen a password before, so we can
  // offer to keep it instead of forcing a new one every time they use a code.
  async function readHasPassword() {
    const { data } = await supabase.auth.getSession()
    return Boolean(data.session?.user?.user_metadata?.portal_password_set)
  }

  // The emailed link brings people back here (?from=email) already signed in.
  // Finish linking their approved registration, then ask them to set a password.
  useEffect(() => {
    if (!arrivedFromEmail) return
    let cancelled = false
    async function linkFromEmail() {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (!data.session) {
        setMode('request-code')
        setError('That link has expired or was already used. Enter your email to get a new code.')
        return
      }
      const { data: claimedId, error: claimError } = await supabase.rpc('claim_parent_account')
      if (cancelled) return
      if (claimError || !claimedId) {
        setMode('password')
        setError("We couldn't link this email to an approved registration. Please contact the centre.")
        return
      }
      await refreshAccount()
      const already = await readHasPassword()
      if (cancelled) return
      setHasPassword(already)
      setMode('set-password')
      setInfo(
        already
          ? 'Email verified. Keep your current password, or choose a new one.'
          : 'Email verified. Now choose a password for next time.'
      )
    }
    linkFromEmail()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedFromEmail])

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
      options: {
        shouldCreateUser: true,
        data: { portal: 'parent' },
        emailRedirectTo: `${window.location.origin}/parent-login?from=email`,
      },
    })
    setLoading(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setEmail(em)
    setCode('')
    setMode('enter-code')
    setInfo(`We've emailed you at ${em}. Type the code below, or click the link in the email. It can take a minute — check your spam folder too.`)
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
    const already = await readHasPassword()
    setLoading(false)
    setHasPassword(already)
    setMode('set-password')
    setInfo(
      already
        ? 'Email verified. Keep your current password, or choose a new one.'
        : 'Email verified. Now choose a password for next time.'
    )
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
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { portal_password_set: true },
    })

    // Supabase refuses to "change" a password to the one it already has. For a
    // parent that just means they typed their existing password again — which is
    // exactly what they want, so treat it as success.
    const sameAsBefore =
      updateError &&
      (updateError.code === 'same_password' || /different from the old password/i.test(updateError.message || ''))

    if (updateError && !sameAsBefore) {
      setLoading(false)
      setError(updateError.message)
      return
    }
    if (sameAsBefore) {
      await supabase.auth.updateUser({ data: { portal_password_set: true } })
    }
    setLoading(false)
    navigate('/parent-portal')
  }

  function handleKeepPassword() {
    navigate('/parent-portal')
  }

  const titles = {
    password: ['Parent Portal', "Sign in to view your child's updates."],
    'request-code': ['Get a code by email', 'For your first login, or if you forgot your password.'],
    'enter-code': ['Enter your code', 'Type the code we emailed you.'],
    'set-password': ['Choose a password', "You'll use this to sign in from now on."],
    linking: ['Verifying your email…', 'One moment please.'],
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-ink-900 mb-1">{titles[mode][0]}</h1>
        <p className="text-sm text-ink-500 mb-6">{titles[mode][1]}</p>

        {error && <div className="mb-4 text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</div>}
        {info && !error && <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">{info}</div>}

        {mode === 'linking' && <p className="text-sm text-ink-500">Please wait…</p>}

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
            {hasPassword && (
              <button type="button" onClick={handleKeepPassword} className="btn-secondary w-full">
                Keep my current password
              </button>
            )}
            <p className="text-xs text-ink-500">
              You can type the same password you used before — it doesn't have to be new.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
