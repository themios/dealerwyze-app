import { type NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isPlatformSuperAdmin, requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'tickets')
  if (denied) return denied

  const supabase = createServiceClient()
  const [isSuperAdmin, scope] = await Promise.all([
    isPlatformSuperAdmin(profile.id),
    getAdminVerticalScope(req),
  ])

  let query = supabase
    .from('support_tickets')
    .select(`
      id, subject, status, priority, created_at, resolved_at, assigned_to,
      sla_breach_at, first_staff_response_at,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Scope to current vertical's orgs (tickets with no org_id are platform-level — always show)
  if (scope.orgIds.length > 0) {
    query = query.or(`org_id.in.(${scope.orgIds.join(',')}),org_id.is.null`)
  }

  // Platform staff only see their assigned tickets
  if (!isSuperAdmin) {
    query = query.eq('assigned_to', profile.id)
  }

  const { data } = await query
  return NextResponse.json(data ?? [])
}
