import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A brand-new, throwaway client for creating a new staff login. Signing
// someone up normally makes THAT client's session become the new user —
// which would log the admin out of their own account if done on the main
// `supabase` client above. This isolated instance never persists a session
// and is never reused, so the admin's real session is untouched.
export function createSignupClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
