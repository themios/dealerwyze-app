import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    { data: recentActivities },
    { data: recentCalls },
    { data: recentLeads },
    { data: emailAccounts },
    { data: bhphLoans },
    { data: voiceCalls },
    { data: faxes },
    { data: contacts },
  ] = await Promise.all([
    supabase.from('activities')
      .select('type, direction, outcome, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.from('voice_calls')
      .select('direction, duration_seconds, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase.from('customers')
      .select('name, lead_source, created_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),

    // Feature heatmap queries (did they use this feature in last 30d?)
    supabase.from('email_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active')
      .gte('updated_at', since30d),

    supabase.from('bhph_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', orgId)
      .gte('created_at', since30d),

    supabase.from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since30d),

    supabase.from('faxes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since30d),

    supabase.from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since30d),
  ])

  // Merge events into a timeline
  type Event = { type: string; label: string; timestamp: string }
  const events: Event[] = []

  for (const act of recentActivities ?? []) {
    const label = `${act.type ?? 'activity'} ${act.direction === 'inbound' ? '←' : '→'} ${act.outcome ?? ''}`
    events.push({ type: 'activity', label: label.trim(), timestamp: act.created_at })
  }

  for (const call of recentCalls ?? []) {
    const mins = Math.round((call.duration_seconds ?? 0) / 60)
    events.push({
      type: 'call',
      label: `Voice call ${call.direction} (${mins}m)`,
      timestamp: call.created_at,
    })
  }

  for (const lead of recentLeads ?? []) {
    events.push({
      type: 'lead',
      label: `New lead: ${lead.name ?? 'Unknown'}${lead.lead_source ? ` via ${lead.lead_source}` : ''}`,
      timestamp: lead.created_at,
    })
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  // Feature heatmap — did they use each feature in 30d?
  const hasActivities = (recentActivities?.length ?? 0) > 0

  // Check pipeline usage via customers with non-default thread_state
  const { count: pipelineCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .not('thread_state', 'eq', 'new_lead')
    .gte('created_at', since30d)

  const feature_heatmap: Record<string, boolean> = {
    email_sync: (emailAccounts as unknown as { count: number } | null)?.count
      ? ((emailAccounts as unknown as { count: number }).count > 0) : false,
    voice:      (voiceCalls as unknown as { count: number } | null)?.count
      ? ((voiceCalls as unknown as { count: number }).count > 0) : false,
    pipeline:   (pipelineCount ?? 0) > 0,
    bhph:       (bhphLoans as unknown as { count: number } | null)?.count
      ? ((bhphLoans as unknown as { count: number }).count > 0) : false,
    analytics:  hasActivities, // proxy — org active = likely using analytics
    fax:        (faxes as unknown as { count: number } | null)?.count
      ? ((faxes as unknown as { count: number }).count > 0) : false,
    contacts:   (contacts as unknown as { count: number } | null)?.count
      ? ((contacts as unknown as { count: number }).count > 0) : false,
  }

  return NextResponse.json({
    events: events.slice(0, 20),
    feature_heatmap,
  })
}
