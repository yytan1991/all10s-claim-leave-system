import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const PortalAuthContext = createContext(null)

// Completely separate from the staff AuthContext — parents and students
// never touch the `profiles` table. This just checks which of
// parent_accounts / student_accounts has a matching user_id after login.
export function PortalAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null) // { type: 'parent' | 'student', ...row }
  const [linkedStudents, setLinkedStudents] = useState([])
  const [loading, setLoading] = useState(true)

  const loadAccount = useCallback(async (userId) => {
    if (!userId) {
      setAccount(null)
      setLinkedStudents([])
      return
    }

    const { data: parentRow } = await supabase
      .from('parent_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (parentRow) {
      const { data: links } = await supabase
        .from('parent_student_links')
        .select('students(id, full_name)')
        .eq('parent_account_id', parentRow.id)
      setAccount({ type: 'parent', ...parentRow })
      setLinkedStudents((links || []).map((l) => l.students).filter(Boolean))
      return
    }

    const { data: studentRow } = await supabase
      .from('student_accounts')
      .select('*, students(id, full_name)')
      .eq('user_id', userId)
      .maybeSingle()

    if (studentRow) {
      setAccount({ type: 'student', ...studentRow })
      setLinkedStudents(studentRow.students ? [studentRow.students] : [])
      return
    }

    // Not approved yet (or rejected) — check the registration request so the
    // portal can show the right message instead of a generic "not set up".
    const { data: registrationRow } = await supabase
      .from('registration_requests')
      .select('status, rejection_reason')
      .eq('parent_auth_user_id', userId)
      .order('created_at', { ascending: false })
      .maybeSingle()

    if (registrationRow) {
      setAccount({ type: 'registration_pending', status: registrationRow.status, rejectionReason: registrationRow.rejection_reason })
      setLinkedStudents([])
      return
    }

    setAccount(null)
    setLinkedStudents([])
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadAccount(data.session?.user?.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await loadAccount(newSession?.user?.id)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadAccount])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  const value = {
    session,
    account,
    linkedStudents,
    loading,
    signIn,
    signOut,
    refreshAccount: () => loadAccount(session?.user?.id),
  }

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext)
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider')
  return ctx
}
