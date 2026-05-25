import { type NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'tickets')
  if (denied) return denied

  const supabase = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  let query = supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')

  if (scope.orgIds.length > 0) {
    query = query.or(`org_id.in.(${scope.orgIds.join(',')}),org_id.is.null`)
  }

  const { count } = await query
  return NextResponse.json({ open: count ?? 0 })
}
