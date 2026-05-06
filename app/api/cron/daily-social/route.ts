import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { absoluteUrl } from '@/lib/dealer-public/site'
import { generateSocialListingCaption } from '@/lib/social/generateListingCaptionGroq'
import { captionForListing, runOrgSocialPublish } from '@/lib/social/runOrgSocialPublish'

export const maxDuration = 120

const MIN_HOURS_BETWEEN = 20

// GET /api/cron/daily-social — Groq-assisted daily spotlight post per org opt-in (Meta feed surfaces).
export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const supabase = createServiceClient()

  const { data: postings } = await supabase
    .from('org_social_posting')
    .select('org_id, last_daily_post_at, facebook_feed, instagram_feed')
    .eq('daily_ai_post_enabled', true)

  let processedOrgs = 0
  let posted = 0
  const errors: string[] = []

  for (const p of postings ?? []) {
    const orgId = p.org_id as string
    try {
      const last = p.last_daily_post_at
        ? new Date(p.last_daily_post_at as string).getTime()
        : 0
      if (last && Date.now() - last < MIN_HOURS_BETWEEN * 3_600_000) {
        continue
      }

      if (p.facebook_feed === false && p.instagram_feed === false) {
        continue
      }

      const { data: org } = await supabase
        .from('organizations')
        .select(
          'id, slug, name, public_inventory_enabled, suspended_at, canceled_at, plan',
        )
        .eq('id', orgId)
        .maybeSingle()

      if (!org?.slug) {
        errors.push(`${orgId}: missing org slug`)
        continue
      }

      if (org.suspended_at || org.canceled_at) {
        continue
      }

      if (org.plan === 'free') {
        continue
      }

      const { data: pool } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', orgId)
        .neq('status', 'sold')
        .limit(60)

      const ids = (pool ?? []).map(v => v.id as string).sort(() => Math.random() - 0.5)

      let chosenId: string | null = null
      let photoUrl: string | null = null

      for (const vid of ids) {
        const { data: ph } = await supabase
          .from('vehicle_photos')
          .select('url')
          .eq('vehicle_id', vid)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()

        const u = typeof ph?.url === 'string' ? ph.url.trim() : ''
        if (u.startsWith('http')) {
          chosenId = vid
          photoUrl = u
          break
        }
      }

      if (!chosenId || !photoUrl) {
        errors.push(`${orgId}: no vehicles with photos`)
        continue
      }

      const { data: vehicle } = await supabase
        .from('vehicles')
        .select(
          'id, year, make, model, trim, price, mileage, public_slug',
        )
        .eq('id', chosenId)
        .single()

      if (!vehicle) continue

      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('business_name, city, state')
        .eq('org_id', orgId)
        .maybeSingle()

      const dealerName =
        (orgSettings?.business_name as string | null)?.trim() ||
        (org.name as string) ||
        'Our dealership'

      const vdpSeg =
        (vehicle.public_slug as string | null)?.trim() || (vehicle.id as string)
      const listingUrl =
        org.public_inventory_enabled
          ? absoluteUrl(`/${org.slug as string}/inventory/${vdpSeg}`)
          : null

      const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
        .filter(Boolean)
        .join(' ')

      const aiCaption = await generateSocialListingCaption({
        dealerName,
        listingUrl,
        vehicleLabel,
        mileage:   vehicle.mileage as number | null,
        price:     vehicle.price as number | null,
        city:      orgSettings?.city as string | null,
        state:     orgSettings?.state as string | null,
      })

      const caption =
        aiCaption?.trim() ||
        `${captionForListing({
          year:    vehicle.year as number | null,
          make:    vehicle.make as string | null,
          model:   vehicle.model as string | null,
          trim:    vehicle.trim as string | null,
          price:   vehicle.price as number | null,
          mileage: vehicle.mileage as number | null,
        })}${listingUrl ? `\n\n${listingUrl}` : ''}`

      const platforms: string[] = []
      if (p.facebook_feed !== false) platforms.push('facebook')
      if (p.instagram_feed !== false) platforms.push('instagram')

      const { results } = await runOrgSocialPublish({
        orgId,
        vehicleId:      chosenId,
        videoRenderId:  null,
        mediaUrl:       photoUrl,
        mediaKind:      'image',
        caption,
        platforms,
        placement:      'feed',
      })

      processedOrgs += 1
      if (results.some(r => r.ok)) {
        posted += 1
        await supabase
          .from('org_social_posting')
          .update({
            last_daily_post_at: new Date().toISOString(),
            updated_at:         new Date().toISOString(),
          })
          .eq('org_id', orgId)
      }
    } catch (e) {
      errors.push(
        `${orgId}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      )
    }
  }

  return NextResponse.json({
    orgs:         (postings ?? []).length,
    processed:    processedOrgs,
    posted,
    sampleNote:   'One random in-stock unit with photos per org (min 20h between runs).',
    errors:       errors.slice(0, 12),
  })
}
