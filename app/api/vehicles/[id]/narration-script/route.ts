import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { buildNarrationScript, buildListingNarrationScript } from '@/lib/remotion/generateNarration'
import type { VehicleVideoProps } from '@/lib/remotion/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/vehicles/[id]/narration-script
 * Returns the auto-generated narration script text for a vehicle.
 * Used by the video creator UI so dealers can load the AI draft as a starting point
 * before editing it into a custom script.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Verify vehicle belongs to this org
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

  const [{ data: v }, { data: orgSettings }, { data: org }, { data: videoSettings }] = await Promise.all([
    userSb.from('vehicles').select('year, make, model, trim, price, mileage, color, interior, engine, mpg_city, mpg_hwy, vin, features, title_status, bedrooms, bathrooms, sqft, property_type, address').eq('id', vehicleId).single(),
    userSb.from('org_settings').select('dealer_name, phone, city, state, website').eq('org_id', profile.org_id).maybeSingle(),
    userSb.from('organizations').select('name, vertical').eq('id', profile.org_id).single(),
    userSb.from('org_video_settings').select('include_price, include_phone, watermark_enabled').eq('org_id', profile.org_id).maybeSingle(),
  ])

  if (!v) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isRe = (org?.vertical as string | null) === 'real_estate'
  const orgName = orgSettings?.dealer_name ?? org?.name ?? (isRe ? 'Agency' : 'Dealer')

  let script: string

  if (isRe) {
    // RE: build a property listing narration
    const vr = v as Record<string, unknown>
    script = buildListingNarrationScript({
      agencyName:    orgName,
      agencyCity:    orgSettings?.city ?? '',
      agencyState:   orgSettings?.state ?? '',
      agencyPhone:   orgSettings?.phone ?? '',
      agencyWebsite: orgSettings?.website ?? undefined,
      address:       (vr.address as string | null) ?? [v.year, v.make, v.model].filter(Boolean).join(' ') ?? 'listing',
      price:         v.price   ?? undefined,
      bedrooms:      (vr.bedrooms  as number | null) ?? undefined,
      bathrooms:     (vr.bathrooms as number | null) ?? undefined,
      sqft:          (vr.sqft as number | null) ?? undefined,
      propertyType:  (vr.property_type as string | null) ?? undefined,
      features:      Array.isArray(vr.features)
        ? (vr.features as string[]).filter(Boolean).slice(0, 6)
        : [],
    })
  } else {
    const props: VehicleVideoProps = {
      dealerName:  orgName,
      dealerCity:  orgSettings?.city ?? '',
      dealerState: orgSettings?.state ?? '',
      dealerPhone: orgSettings?.phone ?? '',
      dealerWebsite: orgSettings?.website ?? undefined,
      year:    v.year    ?? new Date().getFullYear(),
      make:    v.make    ?? '',
      model:   v.model   ?? '',
      trim:    v.trim    ?? undefined,
      price:   v.price   ?? 0,
      mileage: v.mileage ?? 0,
      color:    v.color    ?? undefined,
      interior: v.interior ?? undefined,
      vin:      v.vin      ?? undefined,
      engine:   v.engine   ?? undefined,
      mpgCity:  v.mpg_city ?? undefined,
      mpgHwy:   v.mpg_hwy  ?? undefined,
      isSalvage: (v as Record<string, unknown>).title_status === 'salvage',
      photos: [],
      features: Array.isArray((v as Record<string, unknown>).features)
        ? ((v as Record<string, unknown>).features as string[]).filter(Boolean).slice(0, 6)
        : [],
      showPrice:     videoSettings?.include_price     ?? true,
      showPhone:     videoSettings?.include_phone     ?? true,
      showWatermark: videoSettings?.watermark_enabled ?? true,
    }
    script = buildNarrationScript(props)
  }

  return NextResponse.json({ script })
}
