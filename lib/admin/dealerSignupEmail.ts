import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Org owner email from auth.users — prefers admin, falls back to dealer_admin. */
export async function getDealerSignupEmail(
  supabase: ServiceClient,
  orgId: string,
): Promise<string | null> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('org_id', orgId)
    .in('role', ['admin', 'dealer_admin'])
    .limit(2)

  const profile =
    profiles?.find(p => p.role === 'admin') ??
    profiles?.find(p => p.role === 'dealer_admin') ??
    null

  if (!profile?.id) return null

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
    return authUser?.user?.email ?? null
  } catch {
    return null
  }
}
