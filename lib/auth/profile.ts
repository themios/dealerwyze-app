import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  org_id: string
  platform_role?: 'platform_staff' | null
  deactivated_at?: string | null
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
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile) redirect('/login')
  // Guard: null org_id means incomplete provisioning
  if (!profile.org_id) redirect('/login?reason=no_org')
  // Guard: deactivated users — sign them out as a safety net
  if (profile.deactivated_at) {
    await (supabase as SupabaseClient).auth.signOut()
    redirect('/login?reason=deactivated')
  }
  return profile
}
