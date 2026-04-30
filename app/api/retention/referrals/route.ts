/**
 * GET /api/retention/referrals
 * Returns referral summary for the org: top referrers + source breakdown.
 */

import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessReports } from '@/lib/auth/dealerRoles'

export async function GET() {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  // Fetch customers with referrals for this org
  const { data: referred } = await supabase
    .from('customers')
    .select('id, name, referred_by, referral_source, created_at')
    .eq('user_id', profile.org_id)
    .not('referred_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  // Build referrer summary
  const referrerMap = new Map<string, { referral_count: number; last_referral_at: string }>()
  const sourceCounts = new Map<string, number>()

  for (const r of referred ?? []) {
    if (r.referred_by) {
      const entry = referrerMap.get(r.referred_by) ?? { referral_count: 0, last_referral_at: r.created_at }
      entry.referral_count++
      if (r.created_at > entry.last_referral_at) entry.last_referral_at = r.created_at
      referrerMap.set(r.referred_by, entry)
    }
    if (r.referral_source) {
      sourceCounts.set(r.referral_source, (sourceCounts.get(r.referral_source) ?? 0) + 1)
    }
  }

  // Fetch referrer names
  const referrerIds = [...referrerMap.keys()]
  const referrerNames: Record<string, string> = {}
  if (referrerIds.length > 0) {
    const { data: referrers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', referrerIds)
      .eq('user_id', profile.org_id)
    for (const r of referrers ?? []) {
      referrerNames[r.id] = r.name
    }
  }

  const topReferrers = [...referrerMap.entries()]
    .map(([id, stats]) => ({ customer_id: id, name: referrerNames[id] ?? 'Unknown', ...stats }))
    .sort((a, b) => b.referral_count - a.referral_count)

  const sourceBreakdown = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    total_referred:   referred?.length ?? 0,
    top_referrers:    topReferrers,
    source_breakdown: sourceBreakdown,
  })
}
