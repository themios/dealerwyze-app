import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { UserRole } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  org_id: string
  platform_role?: 'platform_staff' | null
  deactivated_at?: string | null
  created_at: string
  pulse_score?: number | null
}

function normalizeOwnerRole(profile: Profile): Profile {
  // Org owner account (id === org_id) must always have full admin capabilities.
  if (profile.id === profile.org_id && profile.role === 'dealer_rep') {
    return { ...profile, role: 'dealer_admin' }
  }
  return profile
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

  if (!data) return null
  return normalizeOwnerRole(data as Profile)
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
  // Staff impersonation: override org_id from signed cookie
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  if (staffSession?.orgId) {
    return normalizeOwnerRole({ ...profile, org_id: staffSession.orgId })
  }
  return normalizeOwnerRole(profile)
}
