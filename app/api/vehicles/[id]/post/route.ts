import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'
import { orgSocialPostLimiter } from '@/lib/rateLimit/upstash'
import { assertListingPhotoBelongsToVehicle } from '@/lib/social/resolveVehicleListingPhotoUrl'
import type { SocialPlacement } from '@/lib/social/publishListingMedia'
import { captionForListing, runOrgSocialPublish } from '@/lib/social/runOrgSocialPublish'

interface RouteParams {
  params: Promise<{ id: string }>
}

export const maxDuration = 120

/**
 * Posts a rendered video (`renderId`) or a listing photo (`photoUrl`/hero gallery fallback) to Facebook / Instagram feed or story surfaces.
 * RBAC: ledger roles only (excludes `dealer_rep`). Rate-limited per org when Upstash is configured.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: vehicleId } = await params

  let body: {
    renderId?: string
    photoUrl?: string
    caption?: string | null
    platforms?: unknown
    placement?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rl = await orgSocialPostLimiter(profile.org_id)
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          `Too many social posts in a short window — retry in ${rl.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, rl.retryAfterSeconds)) },
      },
    )
  }

  const userSb = await createClientForRequest()
  const { data: vehicle } = await userSb
    .from('vehicles')
    .select('id, year, make, model, trim, price, mileage')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const placement: SocialPlacement =
    body.placement === 'story' ? 'story' : 'feed'

  const caption =
    typeof body.caption === 'string' && body.caption.trim()
      ? body.caption.trim().slice(0, 4000)
      : captionForListing(vehicle)

  let mediaUrl = ''
  let mediaKind: 'image' | 'video' = 'image'
  let videoRenderId: string | null = null

  const renderTrim = typeof body.renderId === 'string' ? body.renderId.trim() : ''

  try {
    if (renderTrim.length > 0) {
      const { data: render } = await userSb
        .from('video_renders')
        .select('id, output_url, status')
        .eq('id', renderTrim)
        .eq('vehicle_id', vehicleId)
        .eq('org_id', profile.org_id)
        .maybeSingle()

      const out = render?.output_url as string | null | undefined
      if (!out || typeof out !== 'string' || render?.status !== 'complete') {
        return NextResponse.json(
          {
            error:
              'Video is not ready yet — leave this page open until the Ready badge appears or try again in a minute.',
          },
          { status: 400 },
        )
      }

      mediaUrl = out.trim()
      mediaKind = 'video'
      videoRenderId = render.id as string
    } else if (typeof body.photoUrl === 'string' && body.photoUrl.startsWith('http')) {
      const { okUrl } = await assertListingPhotoBelongsToVehicle(
        userSb,
        vehicleId,
        body.photoUrl,
      )
      mediaUrl = okUrl
      mediaKind = 'image'
    } else {
      const { data: firstPhoto } = await userSb
        .from('vehicle_photos')
        .select('url')
        .eq('vehicle_id', vehicleId)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()

      const u = typeof firstPhoto?.url === 'string' ? firstPhoto.url.trim() : ''
      if (u.startsWith('http')) {
        mediaUrl = u
        mediaKind = 'image'
      } else {
        return NextResponse.json(
          {
            error:
              'After rendering completes send `renderId`, or provide `photoUrl` that matches your gallery, or upload listing photos.',
          },
          { status: 400 },
        )
      }
    }

    assertSafeOutboundMediaUrl(mediaUrl)
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'Invalid media selection for social post'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  let platforms = body.platforms
  if (!Array.isArray(platforms) || platforms.length === 0) {
    const { data: cfg } = await userSb
      .from('org_social_posting')
      .select('facebook_feed, instagram_feed')
      .eq('org_id', profile.org_id)
      .maybeSingle()

    const next: string[] = []
    if (cfg?.facebook_feed !== false) next.push('facebook')
    if (cfg?.instagram_feed !== false) next.push('instagram')
    platforms = next
  }

  const { results } = await runOrgSocialPublish({
    orgId:          profile.org_id,
    vehicleId,
    videoRenderId,
    mediaUrl,
    mediaKind,
    caption,
    platforms,
    placement,
  })

  const okSome = results.some(r => r.ok)
  const allFail = results.length > 0 && !okSome

  return NextResponse.json({
    ok:      okSome,
    partial: okSome && results.some(r => !r.ok),
    failed:  allFail,
    results,
  })
}
