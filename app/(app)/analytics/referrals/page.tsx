import { requireProfile } from '@/lib/auth/profile'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ReferralsClient from './ReferralsClient'

export default async function ReferralsPage() {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role)) redirect('/dashboard')

  const supabase = createServiceClient()

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

  const referrerIds = [...referrerMap.keys()]
  let referrerNames: Record<string, string> = {}
  if (referrerIds.length > 0) {
    const { data: referrers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', referrerIds)
      .eq('user_id', profile.org_id)
    for (const r of referrers ?? []) referrerNames[r.id] = r.name
  }

  const topReferrers = [...referrerMap.entries()]
    .map(([id, stats]) => ({ customer_id: id, name: referrerNames[id] ?? 'Unknown', ...stats }))
    .sort((a, b) => b.referral_count - a.referral_count)

  const sourceBreakdown = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Referrals</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Customers who sent you referrals.
      </p>
      <ReferralsClient
        totalReferred={referred?.length ?? 0}
        topReferrers={topReferrers}
        sourceBreakdown={sourceBreakdown}
      />
    </div>
  )
}
