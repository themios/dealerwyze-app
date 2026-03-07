import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = await createClient()
  const orgId = profile.org_id

  const { searchParams } = new URL(req.url)
  const rawFrom = searchParams.get('from')
  const rawTo   = searchParams.get('to')
  const toDate   = rawTo   ? new Date(rawTo)   : new Date()
  const fromDate = rawFrom ? new Date(rawFrom) : new Date(Date.now() - 30 * 86400000)
  // Cap range to 365 days to prevent full-table scans / PII over-exposure
  if (isNaN(toDate.getTime()) || isNaN(fromDate.getTime()) ||
      (toDate.getTime() - fromDate.getTime()) / 86400000 > 365) {
    return NextResponse.json({ error: 'Date range invalid or exceeds 365 days' }, { status: 400 })
  }
  const from = fromDate.toISOString()
  const to   = toDate.toISOString()

  // Issue #6: use Promise.allSettled so one failing query never kills the whole route
  const results = await Promise.allSettled([
    supabase
      .from('customers')
      .select('lead_source, thread_state, response_time_seconds, created_at')
      .eq('user_id', orgId)
      .gte('created_at', from)
      .lte('created_at', to),
    supabase
      .from('activities')
      .select('direction, created_at')
      .eq('user_id', orgId)
      .eq('type', 'sms')
      .gte('created_at', from)
      .lte('created_at', to),
    supabase
      .from('voice_calls')
      .select('duration_seconds, created_at')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('created_at', from)
      .lte('created_at', to),
    supabase
      .from('vehicles')
      .select('sold_price, sold_at')
      .eq('user_id', orgId)
      .eq('status', 'sold')
      .not('sold_at', 'is', null)
      .gte('sold_at', from)
      .lte('sold_at', to),
    // BHPH: all-time ratio — not date-filtered
    supabase
      .from('bhph_payments')
      .select('total_paid, loan_amount, status')
      .eq('user_id', orgId)
      .in('status', ['active', 'paid_off']),
  ])

  const customers    = results[0].status === 'fulfilled' ? (results[0].value.data ?? []) : []
  const smsRows      = results[1].status === 'fulfilled' ? (results[1].value.data ?? []) : []
  const voiceRows    = results[2].status === 'fulfilled' ? (results[2].value.data ?? []) : []
  const soldRows     = results[3].status === 'fulfilled' ? (results[3].value.data ?? []) : []
  const bhph         = results[4].status === 'fulfilled' ? (results[4].value.data ?? []) : []

  // Leads by source
  const bySource: Record<string, number> = {}
  customers.forEach(c => {
    const src = c.lead_source ?? 'direct'
    bySource[src] = (bySource[src] ?? 0) + 1
  })

  // Conversion funnel — cumulative count, excludes lost/dormant (terminal non-progression states)
  // Issue #3: lost/dormant customers must not silently fall back to new_lead index 0
  const FUNNEL_STATES = ['new_lead', 'contacted', 'engaged', 'appointment_set', 'appointment_confirmed', 'showed', 'sold']
  const stateIndex = Object.fromEntries(FUNNEL_STATES.map((s, i) => [s, i]))
  const funnelCounts: Record<string, number> = Object.fromEntries(FUNNEL_STATES.map(s => [s, 0]))
  const TERMINAL_SKIP = new Set(['lost', 'dormant'])
  customers.forEach(c => {
    const state = c.thread_state ?? 'new_lead'
    if (TERMINAL_SKIP.has(state)) return  // don't count lost/dormant in funnel
    const idx = stateIndex[state]
    if (idx == null) return               // unknown state — skip rather than miscount
    FUNNEL_STATES.slice(0, idx + 1).forEach(s => { funnelCounts[s]++ })
  })

  // Avg response time
  const withRT = customers.filter(c => c.response_time_seconds != null)
  const avgResponseSeconds = withRT.length
    ? Math.round(withRT.reduce((s, c) => s + (c.response_time_seconds ?? 0), 0) / withRT.length)
    : null

  // SMS stats — Issue #4: outbound SMS have outcome=null (set by send route),
  // so 'delivered' is not reliably trackable. Expose sent/replied/reply_rate only.
  const smsSent    = smsRows.filter(a => a.direction === 'outbound').length
  const smsReplied = smsRows.filter(a => a.direction === 'inbound').length

  // Voice stats
  const voiceTotal        = voiceRows.length
  const voiceTotalSeconds = voiceRows.reduce((s, c) => s + ((c as { duration_seconds?: number }).duration_seconds ?? 0), 0)
  const voiceAvgSeconds   = voiceTotal ? Math.round(voiceTotalSeconds / voiceTotal) : 0
  const voiceCostEst      = parseFloat(((voiceTotalSeconds / 60) * 0.01).toFixed(2))

  // Revenue
  const revenue   = soldRows.reduce((s, v) => s + (v.sold_price ?? 0), 0)
  const unitsSold = soldRows.length

  // BHPH collection rate — Issue #13: loan_amount only (down_payment is paid upfront at signing,
  // not tracked in total_paid running balance, so must not be in the denominator)
  const totalLoan = bhph.reduce((s, b) => s + (b.loan_amount ?? 0), 0)
  const totalPaid = bhph.reduce((s, b) => s + (b.total_paid ?? 0), 0)
  const bhphRate  = totalLoan > 0 ? Math.round((totalPaid / totalLoan) * 100) : null

  return NextResponse.json({
    period: { from, to },
    leads: {
      total: customers.length,
      by_source: bySource,
      avg_response_seconds: avgResponseSeconds,
    },
    funnel: FUNNEL_STATES.map(state => ({ state, count: funnelCounts[state] ?? 0 })),
    sms: { sent: smsSent, replied: smsReplied },
    voice: {
      total: voiceTotal,
      avg_duration_seconds: voiceAvgSeconds,
      total_seconds: voiceTotalSeconds,
      estimated_cost: voiceCostEst,
    },
    revenue: { total: revenue, units_sold: unitsSold },
    bhph: { collection_rate_pct: bhphRate, total_paid: totalPaid, total_loan: totalLoan },
  })
}
