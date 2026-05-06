/**
 * POST /api/vehicles/[id]/carousel
 *
 * Composes a branded Instagram carousel from selected vehicle photos and posts it.
 *
 * Body:
 *   photoUrls  string[]  — 2–9 dealer photos (composer appends end card → ≤ 10 slides)
 *   caption?   string    — custom caption (max 2 200 chars); defaults to vehicle + dealer info
 *
 * Flow:
 *  1. Auth + vehicle ownership check.
 *  2. Fetch org_settings (branding) + org_social_posting (Instagram creds).
 *  3. Validate + SSRF-check photo URLs.
 *  4. composeCarouselSlides() — Sharp compositing + R2 upload.
 *  5. publishInstagramCarousel() — Meta Graph API.
 *  6. Log to social_publish_log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'
import { composeCarouselSlides } from '@/lib/social/carouselComposer'
import { publishInstagramCarousel, buildInstagramPostUrl } from '@/lib/social/instagram'

export const maxDuration = 120

interface RouteParams {
  params: Promise<{ id: string }>
}

const UuidSchema = z.string().uuid()

const BodySchema = z.object({
  photoUrls: z
    .array(z.string().url())
    .min(2, 'Select at least 2 photos for a carousel')
    .max(9, 'Select up to 9 photos (the end card is added automatically)'),
  caption: z.string().max(2200).optional(),
})

export async function POST(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  if (!UuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Ownership check via RLS
  // createClientForRequest: session in scope, RLS enforces org isolation on vehicles.
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
    return NextResponse.json({ error: msg }, { status: 422 })
  }

  const { photoUrls, caption } = parsed.data

  // SSRF guard: validate every photo URL before downloading
  try {
    for (const url of photoUrls) {
      assertSafeOutboundMediaUrl(url)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid photo URL' }, { status: 422 })
  }

  const [{ data: orgSettings }, { data: igAccount }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('business_name, business_phone, city, state, dealer_website_url, social_hashtags, social_tagline, social_footer')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    // Credentials come from social_accounts (OAuth flow, migration 089) — not org_social_posting.
    // Service role + explicit org_id enforces tenant isolation.
    // Use order+limit(1) to handle orgs with multiple Instagram accounts gracefully.
    supabase
      .from('social_accounts')
      .select('instagram_business_account_id, access_token')
      .eq('org_id', profile.org_id)
      .eq('platform', 'instagram')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!igAccount?.instagram_business_account_id || !igAccount?.access_token) {
    return NextResponse.json(
      { error: 'Instagram is not connected for this dealership. Go to Settings → Social Accounts to connect.' },
      { status: 422 },
    )
  }

  const branding = {
    dealerName: orgSettings?.business_name      ?? 'Dealer',
    phone:      orgSettings?.business_phone     ?? '',
    city:       orgSettings?.city               ?? '',
    state:      orgSettings?.state              ?? '',
    website:    orgSettings?.dealer_website_url ?? '',
  }

  // Build a default caption when none is provided
  const finalCaption =
    caption?.trim() ||
    buildDefaultCaption(vehicle, branding.dealerName, {
      tagline:  orgSettings?.social_tagline  ?? '',
      footer:   orgSettings?.social_footer   ?? '',
      hashtags: orgSettings?.social_hashtags ?? '',
    })

  // Compose branded slides (downloads photos, overlays, uploads to R2)
  let slideUrls: string[]
  try {
    slideUrls = await composeCarouselSlides({
      photoUrls,
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
    console.error('[carousel] compose error:', msg)
    return NextResponse.json({ error: `Failed to prepare carousel images: ${msg}` }, { status: 500 })
  }

  // Post to Instagram
  let igMediaId: string
  try {
    igMediaId = await publishInstagramCarousel(
      slideUrls,
      finalCaption,
      igAccount.instagram_business_account_id,
      igAccount.access_token,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Instagram posting failed'
    console.error('[carousel] instagram error:', msg)
    return NextResponse.json({ error: `Instagram error: ${msg}` }, { status: 502 })
  }

  const postUrl = buildInstagramPostUrl(igMediaId)

  const { error: logErr } = await supabase.from('social_publish_log').insert({
    org_id:            profile.org_id,
    vehicle_id:        vehicleId,
    platform:          'instagram',
    placement:         'carousel',
    status:            'posted',
    platform_post_url: postUrl,
    graph_object_id:   igMediaId,
    triggered_by:      'manual',
    triggered_by_user: profile.id,
  })

  if (logErr) {
    console.error('[carousel] log insert error:', logErr.message)
    // Non-fatal — the post is already live; don't return an error to the client
  }

  return NextResponse.json({ ok: true, postUrl, slideCount: slideUrls.length })
}

function buildDefaultCaption(
  vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null; price: number | null },
  dealerName: string,
  socialDefaults?: { tagline?: string; footer?: string; hashtags?: string },
): string {
  const label    = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  const priceStr = vehicle.price != null ? `$${Number(vehicle.price).toLocaleString('en-US')}` : null
  const lines: string[]  = [`Just listed: ${label}${priceStr ? ` — ${priceStr}` : ''}`, '']

  if (socialDefaults?.tagline?.trim()) {
    lines.push(socialDefaults.tagline.trim(), '')
  }

  lines.push(`📍 ${dealerName}`)
  lines.push('📞 Call or text us today')

  if (socialDefaults?.footer?.trim()) {
    lines.push('', socialDefaults.footer.trim())
  }

  lines.push('')
  const hashtags = socialDefaults?.hashtags?.trim()
  lines.push(hashtags || `#usedcars #${vehicle.make?.replace(/\s+/g, '') ?? 'cars'} #${vehicle.model?.replace(/\s+/g, '') ?? 'auto'} #dealerwyze #carsofinstagram`)

  return lines.join('\n')
}
