/**
 * GET /api/admin/intelligence-health
 * Platform admin view: recent intelligence_events per org (last 24h count by event_type).
 * Used to verify the event stream is healthy after Phase 1 instrumentation.
 */

import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

export async function GET() {
  const profile = await requireProfile()
  await requirePlatformSuperAdmin(profile.id)

  const supabase = createServiceClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('intelligence_events')
    .select('org_id, event_type, occurred_at')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[intelligence-health]', error.message)
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 })
  }

  // Aggregate: counts per org and event_type
  const orgMap: Record<string, Record<string, number>> = {}
  for (const row of data ?? []) {
    if (!orgMap[row.org_id]) orgMap[row.org_id] = {}
    orgMap[row.org_id][row.event_type] = (orgMap[row.org_id][row.event_type] ?? 0) + 1
  }

  const summary = Object.entries(orgMap).map(([orgId, counts]) => ({
    org_id: orgId,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    by_type: counts,
  })).sort((a, b) => b.total - a.total)

  return NextResponse.json({ since, orgs: summary, raw_count: (data ?? []).length })
}
