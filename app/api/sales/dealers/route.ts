/**
 * GET  /api/sales/dealers — list dealers referred by this rep, with churn signals
 * POST /api/sales/dealers — archive or unarchive a dealer from rep's view
 *
 * Reps can NEVER delete dealers — only soft-archive from their own view.
 * No export endpoint exists by design.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requireChannelRep, isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export type DealerHealth = 'churned' | 'at_risk' | 'dormant' | 'free' | 'trialing' | 'healthy'

function computeHealth(org: {
  subscription_status: string
  monthly_message_count: number
}): DealerHealth {
  const s = org.subscription_status
  if (s === 'canceled' || s === 'unpaid')                      return 'churned'
  if (s === 'past_due')                                         return 'at_risk'
  if (s === 'free')                                             return 'free'
  if (s === 'trialing')                                         return 'trialing'
  if (s === 'active' && org.monthly_message_count === 0)        return 'dormant'
  return 'healthy'
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const service  = createServiceClient()

  let affiliateCode: string
  let viewerProfileId = profile.id

  const previewCode = req.nextUrl.searchParams.get('code')
  if (previewCode && await isPlatformSuperAdmin(profile.id)) {
    affiliateCode = previewCode
  } else {
    const result = await requireChannelRep(profile.id)
    if (result.denied) return result.denied
    affiliateCode = result.affiliateCode
  }

  const includeArchived = req.nextUrl.searchParams.get('include_archived') === 'true'

  const [orgRes, archivedRes] = await Promise.all([
    service
      .from('organizations')
      .select('id, name, slug, subscription_status, monthly_message_count, created_at')
      .eq('affiliate_code', affiliateCode)
      .order('created_at', { ascending: false }),
    service
      .from('rep_archived_orgs')
      .select('org_id')
      .eq('profile_id', viewerProfileId),
  ])

  if (orgRes.error) return NextResponse.json({ error: orgRes.error.message }, { status: 500 })

  const archivedIds = new Set((archivedRes.data ?? []).map(r => r.org_id))

  const dealers = (orgRes.data ?? [])
    .filter(org => includeArchived || !archivedIds.has(org.id))
    .map(org => ({
      ...org,
      health:   computeHealth(org),
      archived: archivedIds.has(org.id),
    }))

  const priority: Record<DealerHealth, number> = {
    churned:  0,
    at_risk:  1,
    dormant:  2,
    free:     3,
    trialing: 4,
    healthy:  5,
  }
  dealers.sort((a, b) => priority[a.health] - priority[b.health])

  return NextResponse.json({ dealers })
}

/**
 * POST /api/sales/dealers  { org_id, archived: true|false }
 * Archive hides a dealer from the rep's dashboard without deleting anything.
 * Reps cannot delete orgs — only admins can do that via /api/admin/orgs.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const result  = await requireChannelRep(profile.id)
  if (result.denied) return result.denied

  const { org_id, archived } = await req.json().catch(() => ({}))
  if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const service = createServiceClient()

  // Verify this org belongs to this rep's affiliate code
  const { data: org } = await service
    .from('organizations')
    .select('affiliate_code')
    .eq('id', org_id)
    .single()

  if (org?.affiliate_code !== result.affiliateCode) {
    return NextResponse.json({ error: 'Not your dealer' }, { status: 403 })
  }

  if (archived) {
    await service.from('rep_archived_orgs')
      .upsert({ profile_id: profile.id, org_id }, { onConflict: 'profile_id,org_id' })
  } else {
    await service.from('rep_archived_orgs')
      .delete()
      .eq('profile_id', profile.id)
      .eq('org_id', org_id)
  }

  return NextResponse.json({ ok: true, archived: Boolean(archived) })
}
