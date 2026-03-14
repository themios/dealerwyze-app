import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'alerts')
  if (denied) return denied

  const supabase = createServiceClient()

  // ?count=1 → lightweight count-only response for badge use
  if (req.nextUrl.searchParams.get('count') === '1') {
    const { count, error } = await supabase
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null)
    if (error) return NextResponse.json({ unresolved: 0 })
    return NextResponse.json({ unresolved: count ?? 0 })
  }

  const { data, error } = await supabase
    .from('admin_alerts')
    .select('id, org_id, alert_type, severity, created_at, resolved_at, organizations(id, name)')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
