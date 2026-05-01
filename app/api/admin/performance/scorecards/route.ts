import { NextRequest, NextResponse } from 'next/server'

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManagePerformance, clampPerformanceDays, formatTrend } from '@/lib/intelligence/performance'

type ScorecardMetric = {
  repId: string
  repName: string
  avgFirstResponseMinutes: number
  replyRate: number
  conversionRate: number
  ghostRate: number
  avgTouchesBeforeClose: number
  avgTouchesBeforeLoss: number
  lostLeadTrend: { delta: number; direction: 'up' | 'down' | 'flat' }
  absoluteCounts: null | {
    leadsWorked: number
    appointmentsSet: number
    sold: number
    lost: number
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const canSeeAll = canManagePerformance(profile)
  const searchParams = req.nextUrl.searchParams
  const days = clampPerformanceDays(searchParams.get('days'), 30)
  const selfRequested = searchParams.get('self') === 'true'
  const selfMode = !canSeeAll || selfRequested

  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  const previousFrom = new Date(from)
  previousFrom.setDate(previousFrom.getDate() - days)

  const supabase = createServiceClient()
  const profilesQuery = supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('org_id', profile.org_id)
    .in('role', ['dealer_admin', 'dealer_manager', 'dealer_finance', 'dealer_rep', 'dealer_staff', 'admin', 'agent'])
    .order('display_name', { ascending: true })

  const [
    { data: profiles },
    { data: responseRows },
    { data: replyRows },
    { data: funnelRows },
    { data: lostRowsCurrent },
    { data: lostRowsPrevious },
    { data: soldRows },
  ] = await Promise.all([
    profilesQuery,
    supabase
      .from('v_rep_response_times')
      .select('assigned_rep_id, first_response_minutes, lead_created_at')
      .eq('org_id', profile.org_id)
      .gte('lead_created_at', from.toISOString()),
    supabase
      .from('v_rep_reply_rates')
      .select('assigned_rep_id, got_reply, outbound_at')
      .eq('org_id', profile.org_id)
      .gte('outbound_at', from.toISOString()),
    supabase
      .from('v_rep_conversion_funnel')
      .select('assigned_rep_id, has_appointment, is_sold, first_lead_at')
      .eq('org_id', profile.org_id)
      .gte('first_lead_at', from.toISOString()),
    supabase
      .from('lost_lead_audit')
      .select('assigned_rep_id, touches, archived_at, archive_reason')
      .eq('org_id', profile.org_id)
      .gte('archived_at', from.toISOString()),
    supabase
      .from('lost_lead_audit')
      .select('assigned_rep_id, archived_at')
      .eq('org_id', profile.org_id)
      .gte('archived_at', previousFrom.toISOString())
      .lt('archived_at', from.toISOString()),
    supabase
      .from('deal_intent_outcomes')
      .select(`
        customer_id,
        sold_at,
        customers!inner(id, assigned_to, user_id)
      `)
      .eq('org_id', profile.org_id)
      .gte('sold_at', from.toISOString()),
  ])

  const visibleProfiles = (profiles ?? []).filter(rep => selfMode ? rep.id === profile.id : true)
  const repIds = new Set(visibleProfiles.map(rep => rep.id))

  const soldCustomerIds = (soldRows ?? [])
    .map(row => {
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
      if (!customer || !customer.assigned_to || !repIds.has(customer.assigned_to)) return null
      return {
        customerId: row.customer_id as string,
        repId: customer.assigned_to as string,
      }
    })
    .filter(Boolean) as Array<{ customerId: string; repId: string }>

  const soldTouchCounts = new Map<string, number>()
  if (soldCustomerIds.length > 0) {
    const { data: soldTouches } = await supabase
      .from('activities')
      .select('customer_id')
      .eq('user_id', profile.org_id)
      .eq('direction', 'outbound')
      .in('type', ['call', 'sms', 'email', 'sms_followup', 'email_followup'])
      .in('customer_id', soldCustomerIds.map(item => item.customerId))

    for (const row of soldTouches ?? []) {
      if (!row.customer_id) continue
      soldTouchCounts.set(row.customer_id, (soldTouchCounts.get(row.customer_id) ?? 0) + 1)
    }
  }

  const scorecards: ScorecardMetric[] = visibleProfiles.map(rep => {
    const responseForRep = (responseRows ?? []).filter(row => row.assigned_rep_id === rep.id)
    const replyForRep = (replyRows ?? []).filter(row => row.assigned_rep_id === rep.id)
    const funnelForRep = (funnelRows ?? []).filter(row => row.assigned_rep_id === rep.id)
    const lostForRep = (lostRowsCurrent ?? []).filter(row => row.assigned_rep_id === rep.id)
    const previousLostForRep = (lostRowsPrevious ?? []).filter(row => row.assigned_rep_id === rep.id)
    const soldForRep = soldCustomerIds.filter(item => item.repId === rep.id)

    const avgFirstResponseMinutes = responseForRep.length > 0
      ? round(responseForRep.reduce((sum, row) => sum + Number(row.first_response_minutes ?? 0), 0) / responseForRep.length)
      : 0
    const replyRate = replyForRep.length > 0
      ? round((replyForRep.filter(row => !!row.got_reply).length / replyForRep.length) * 100)
      : 0
    const leadsWorked = funnelForRep.length
    const appointmentsSet = funnelForRep.filter(row => !!row.has_appointment).length
    const sold = funnelForRep.filter(row => !!row.is_sold).length
    const conversionRate = leadsWorked > 0 ? round((sold / leadsWorked) * 100) : 0
    const ghostRate = lostForRep.length > 0
      ? round((lostForRep.filter(row => row.archive_reason === 'ghost').length / lostForRep.length) * 100)
      : 0
    const avgTouchesBeforeLoss = lostForRep.length > 0
      ? round(lostForRep.reduce((sum, row) => sum + Number(row.touches ?? 0), 0) / lostForRep.length)
      : 0
    const soldTouches = soldForRep.map(item => soldTouchCounts.get(item.customerId) ?? 0)
    const avgTouchesBeforeClose = soldTouches.length > 0
      ? round(soldTouches.reduce((sum, count) => sum + count, 0) / soldTouches.length)
      : 0

    return {
      repId: rep.id,
      repName: rep.display_name,
      avgFirstResponseMinutes,
      replyRate,
      conversionRate,
      ghostRate,
      avgTouchesBeforeClose,
      avgTouchesBeforeLoss,
      lostLeadTrend: formatTrend(lostForRep.length, previousLostForRep.length),
      absoluteCounts: selfMode ? null : {
        leadsWorked,
        appointmentsSet,
        sold,
        lost: lostForRep.length,
      },
    }
  })

  scorecards.sort((a, b) => b.conversionRate - a.conversionRate || a.avgFirstResponseMinutes - b.avgFirstResponseMinutes)

  return NextResponse.json({
    days,
    viewerMode: selfMode ? 'self' : 'admin',
    scorecards,
  })
}
