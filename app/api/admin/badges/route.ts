import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

// Returns all admin sidebar badge counts in a single request
export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'alerts')
  if (denied) return denied

  const supabase = createServiceClient()

  const [alertsRes, ticketsRes, atRiskRes] = await Promise.all([
    supabase
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
  ])

  return NextResponse.json({
    alerts: alertsRes.count ?? 0,
    tickets: ticketsRes.count ?? 0,
  })
}
