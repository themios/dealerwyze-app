/**
 * POST /api/vehicles/[id]/facebook-post
 *
 * Manually post a vehicle to a connected Facebook Page.
 *
 * Supports two post types:
 *   type: "photo" — composes a single branded hero image and posts to the Page feed.
 *   type: "reel"  — posts an existing rendered video as a Facebook Reel.
 *
 * Body (photo):
 *   type      "photo"
 *   photoUrl  string  — single vehicle photo URL
 *   caption?  string  — post text (max 63 206 chars)
 *
 * Body (reel):
 *   type      "reel"
 *   videoUrl  string  — publicly reachable rendered video URL
 *   caption?  string  — post text
 *
 * Flow:
 *  1. Auth + vehicle ownership check.
 *  2. Fetch org_settings (branding) + social_accounts (Facebook page creds).
 *  3. For photo: SSRF-check + Sharp compositing + R2 upload + FB photo post API.
 *     For reel:  SSRF-check + FB video post API.
 *  4. Log to social_publish_log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'
import { composeFacebookSlides } from '@/lib/social/carouselComposer'
import { postMultiplePhotosToFacebook, postReelToFacebook, buildFacebookPostUrl } from '@/lib/social/facebook'

export const maxDuration = 120

interface RouteParams {
  params: Promise<{ id: string }>
}

const UuidSchema = z.string().uuid()

const BodySchema = z.discriminatedUnion('type', [
  z.object({
    type:      z.literal('photo'),
    photoUrls: z
      .array(z.string().url())
      .min(1, 'Select at least 1 photo')
      .max(10, 'Select up to 10 photos'),
    caption:   z.string().max(63_206).optional(),
  }),
  z.object({
    type:     z.literal('reel'),
    videoUrl: z.string().url(),
    caption:  z.string().max(63_206).optional(),
  }),
])

export async function POST(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  if (!UuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Ownership check via RLS
  const supabase = await createClientForRequest()
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim, price, mileage, user_id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Parse + validate body
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    console.error('[facebook-post] Zod validation failed:', parsed.error.issues)
    return NextResponse.json({ error: msg }, { status: 422 })
  }

  const body = parsed.data

  // SSRF guard — validate every URL before any outbound fetch
  try {
    const urlsToCheck = body.type === 'photo' ? body.photoUrls : [body.videoUrl]
    for (const url of urlsToCheck) {
      assertSafeOutboundMediaUrl(url)
    }
  } catch (err) {
    const mediaErr = err instanceof Error ? err.message : 'Invalid media URL'
    console.error('[facebook-post] SSRF guard blocked URL:', mediaErr)
    return NextResponse.json({ error: `Photo URL not allowed: ${mediaErr}` }, { status: 422 })
  }

  const [{ data: orgSettings, error: orgErr }, { data: fbAccount, error: fbErr }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('business_name, business_phone, city, state, dealer_website_url, social_hashtags, social_tagline, social_footer')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('social_accounts')
      // platform_account_id is the same as page_id for Facebook; use as fallback
      .select('page_id, platform_account_id, access_token')
      .eq('org_id', profile.org_id)
      .eq('platform', 'facebook')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (orgErr) console.error('[facebook-post] org_settings fetch error:', orgErr.message)
  if (fbErr)  console.error('[facebook-post] social_accounts fetch error:', fbErr.message)
  console.info(
    '[facebook-post] fbAccount:',
    fbAccount
      ? `page_id=${fbAccount.page_id} platform_account_id=${fbAccount.platform_account_id} has_token=${!!fbAccount.access_token}`
      : 'null',
  )

  // page_id and platform_account_id are the same value for Facebook Pages;
  // fall back to platform_account_id in case page_id was null from an older OAuth upsert.
  const pageId = fbAccount?.page_id ?? fbAccount?.platform_account_id

  if (!fbAccount || !pageId || !fbAccount.access_token) {
    return NextResponse.json(
      { error: 'No Facebook Page is connected. Go to Settings → Social Accounts to connect.' },
      { status: 422 },
    )
  }

  const branding = {
    dealerName: orgSettings?.business_name     ?? 'Dealer',
    phone:      orgSettings?.business_phone    ?? '',
    city:       orgSettings?.city              ?? '',
    state:      orgSettings?.state             ?? '',
    website:    orgSettings?.dealer_website_url ?? '',
  }

  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')

  const socialDefaults = {
    tagline:  orgSettings?.social_tagline  ?? '',
    footer:   orgSettings?.social_footer   ?? '',
    hashtags: orgSettings?.social_hashtags ?? '',
  }
  const defaultCaption = buildDefaultCaption(vehicle, branding.dealerName, branding.phone, socialDefaults)

  let fbPostId: string
  let placement: 'feed' | 'reel'

  if (body.type === 'photo') {
    placement = 'feed'

    // Compose branded slides (hero overlay on slide 1, dealer watermark on rest)
    let slideUrls: string[]
    try {
      slideUrls = await composeFacebookSlides({
        photoUrls: body.photoUrls,
        vehicle: {
          year:    vehicle.year,
          make:    vehicle.make,
          model:   vehicle.model,
          trim:    vehicle.trim,
          price:   vehicle.price,
          mileage: vehicle.mileage,
        },
        branding,
        orgId:     profile.org_id,
        vehicleId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image compositing failed'
      console.error('[facebook-post] compose error:', msg)
      return NextResponse.json({ error: `Failed to prepare images: ${msg}` }, { status: 500 })
    }

    const caption = body.caption?.trim() || defaultCaption

    try {
      fbPostId = await postMultiplePhotosToFacebook(slideUrls, caption, pageId, fbAccount.access_token)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Facebook post failed'
      console.error('[facebook-post] photo error:', msg)
      return NextResponse.json({ error: `Facebook error: ${msg}` }, { status: 502 })
    }
  } else {
    placement = 'reel'

    const caption = body.caption?.trim() || `${vehicleLabel} — ${branding.dealerName}\n\n${branding.phone ? `📞 ${branding.phone}` : ''}`

    try {
      fbPostId = await postReelToFacebook(body.videoUrl, caption, pageId, fbAccount.access_token)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Facebook Reel post failed'
      console.error('[facebook-post] reel error:', msg)
      return NextResponse.json({ error: `Facebook error: ${msg}` }, { status: 502 })
    }
  }

  const postUrl = buildFacebookPostUrl(pageId, fbPostId)

  const { error: logErr } = await supabase.from('social_publish_log').insert({
    org_id:            profile.org_id,
    vehicle_id:        vehicleId,
    platform:          'facebook',
    placement,
    status:            'posted',
    platform_post_url: postUrl,
    graph_object_id:   fbPostId,
    triggered_by:      'manual',
    triggered_by_user: profile.id,
  })

  if (logErr) {
    console.error('[facebook-post] log insert error:', logErr.message)
    // Non-fatal — the post is already live
  }

  return NextResponse.json({ ok: true, postUrl, type: body.type })
}

function buildDefaultCaption(
  vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null; price: number | null },
  dealerName: string,
  phone: string,
  socialDefaults?: { tagline?: string; footer?: string; hashtags?: string },
): string {
  const label    = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  const priceStr = vehicle.price != null ? `$${Number(vehicle.price).toLocaleString('en-US')}` : null
  const lines: string[] = [
    `🚗 Just listed: ${label}${priceStr ? ` — ${priceStr}` : ''}`,
    '',
  ]

  if (socialDefaults?.tagline?.trim()) {
    lines.push(socialDefaults.tagline.trim(), '')
  }

  lines.push(`📍 ${dealerName}`)
  if (phone) lines.push(`📞 ${phone}`)

  if (socialDefaults?.footer?.trim()) {
    lines.push('', socialDefaults.footer.trim())
  }

  lines.push('')
  const hashtags = socialDefaults?.hashtags?.trim()
  lines.push(hashtags || `#usedcars #${vehicle.make?.replace(/\s+/g, '') ?? 'cars'} #${vehicle.model?.replace(/\s+/g, '') ?? 'auto'} #dealerwyze`)
  return lines.join('\n')
}
