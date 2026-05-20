import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function verifyAdminOrg(
  supabase: ServiceClient,
  orgId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .neq('id', SENTINEL_ORG_ID)
    .maybeSingle()
  return data
}

/** Signup email from auth.users for org owner (same pattern as GET /api/admin/orgs/[id]). */
export async function getDealerSignupEmail(
  supabase: ServiceClient,
  orgId: string,
): Promise<string | null> {
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .maybeSingle()

  if (!adminProfile?.id) return null

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
    return authUser?.user?.email ?? null
  } catch {
    return null
  }
}

export async function resolveProfileNames(
  supabase: ServiceClient,
  profileIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))]
  const nameMap: Record<string, string> = {}
  if (!ids.length) return nameMap

  const { data: rows } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)

  for (const p of rows ?? []) {
    nameMap[p.id] = p.display_name ?? 'Unknown'
  }
  return nameMap
}
