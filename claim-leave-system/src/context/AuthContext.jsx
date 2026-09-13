import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)
const ACTIVE_PROFILE_KEY = 'all10s_active_profile_id'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [suspendedNotice, setSuspendedNotice] = useState('')

  const loadMemberships = useCallback(async (userId) => {
    if (!userId) {
      setMemberships([])
      setActiveProfileId(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*, organizations(name, is_active)')
      .eq('user_id', userId)

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load memberships', error)
      setMemberships([])
      setActiveProfileId(null)
      return
    }

    setMemberships(data || [])

    if ((data || []).length === 1) {
      setActiveProfileId(data[0].id)
    } else {
      const remembered = sessionStorage.getItem(ACTIVE_PROFILE_KEY)
      const stillValid = (data || []).some((m) => m.id === remembered)
      setActiveProfileId(stillValid ? remembered : null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadMemberships(data.session?.user?.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await loadMemberships(newSession?.user?.id)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadMemberships])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signOut = () => {
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY)
    setActiveProfileId(null)
    setSuspendedNotice('')
    return supabase.auth.signOut()
  }

  const switchCompany = () => {
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY)
    setActiveProfileId(null)
  }

  // Called from the company picker (or automatically, when there's only
  // one membership). Blocks the switch if that specific organization has
  // been suspended by a superadmin.
  const selectMembership = async (profileId) => {
    const membership = memberships.find((m) => m.id === profileId)
    if (!membership) return

    if (membership.role !== 'superadmin' && membership.organizations?.is_active === false) {
      setSuspendedNotice(
        `${membership.organizations?.name || 'This organization'}'s access has been suspended. Please contact your administrator.`
      )
      return
    }

    setSuspendedNotice('')
    sessionStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
    setActiveProfileId(profileId)
  }

  const profile = memberships.find((m) => m.id === activeProfileId) || null
  const needsCompanyPicker = !loading && session && !profile && memberships.length > 1

  const isManager = profile?.role === 'manager' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'
  const isSuperadmin = profile?.role === 'superadmin'

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    memberships,
    needsCompanyPicker,
    suspendedNotice,
    loading,
    isManager,
    isAdmin,
    isSuperadmin,
    signIn,
    signOut,
    switchCompany,
    selectMembership,
    refreshProfile: () => loadMemberships(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
