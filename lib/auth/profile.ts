import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface Profile {
  id: string
  display_name: string
  role: 'admin' | 'agent'
  org_id: string
  created_at: string
}

/** Get current user's profile. Returns null if not authenticated or no profile. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data ?? null
}

/** Get profile or redirect to login. Use in server components. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  return profile
}
