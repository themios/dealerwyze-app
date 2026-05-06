import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { createClientForRequest } from '@/lib/supabase/forRequest'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Social post history for a vehicle (used by `SocialPostStatus`).
 * RBAC: ledger roles — keeps external attribution data off low-privilege desks.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: vehicleId } = await params

  const userSb = await createClientForRequest()
  const { data: vehicle } = await userSb
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: rows } = await userSb
    .from('social_publish_log')
    .select(
      'id, platform, status, platform_post_url, posted_at, error_message, created_at',
    )
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(24)

  const posts = (rows ?? []).map(r => {
    const st = (r.status as string) ?? 'pending'
    const uiStatus =
      st === 'posted'
        ? 'posted'
        : st === 'failed'
          ? 'failed'
          : st === 'skipped'
            ? 'skipped'
            : st === 'posting'
              ? 'posting'
              : 'pending'

    return {
      id:                 r.id as string,
      platform:           r.platform as string,
      status:             uiStatus,
      platform_post_url:  (r.platform_post_url as string | null) ?? null,
      posted_at:          (r.posted_at as string | null) ?? (uiStatus === 'posted' ? (r.created_at as string) : null),
      error_message:      (r.error_message as string | null) ?? null,
    }
  })

  return NextResponse.json({ posts })
}
