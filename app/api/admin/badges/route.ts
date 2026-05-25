import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

// Returns all admin sidebar badge counts in a single request
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'alerts')
  if (denied) return denied

  const supabase = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  if (scope.orgIds.length === 0) {
    return NextResponse.json({ alerts: 0, tickets: 0, new_orgs: 0 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [alertsRes, ticketsRes, newOrgsRes] = await Promise.all([
    supabase
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false)
      .in('org_id', scope.orgIds),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .in('id', scope.orgIds)
      .gte('created_at', thirtyDaysAgo),
  ])

  return NextResponse.json({
    alerts: alertsRes.count ?? 0,
    tickets: ticketsRes.count ?? 0,
    new_orgs: newOrgsRes.count ?? 0,
  })
}
