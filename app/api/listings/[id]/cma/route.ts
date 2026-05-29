/**
 * GET /api/listings/[id]/cma
 * LIST-05 — Comparative Market Analysis via RentCast AVM.
 *
 * Returns comparables and estimated value. Caches results in market_data_json
 * for 7 days (168 hours). If cache is fresh, returns it without calling RentCast.
 * Adapted from the dealer market-check route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { fetchCMA, buildFullAddress } from '@/lib/listings/rentcast'

export const maxDuration = 30

const CACHE_TTL_HOURS = 168 // 7 days

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Vertical guard — RE orgs only
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch listing with fields needed for CMA
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, property_type, market_data_json, market_checked_at')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single()

    if (!vehicle) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Serve from cache if fresh (< 7 days old) and data present
    if (vehicle.market_checked_at && vehicle.market_data_json) {
      const ageHours = (Date.now() - new Date(vehicle.market_checked_at as string).getTime()) / 3_600_000
      if (ageHours < CACHE_TTL_HOURS) {
        return NextResponse.json({
          data: vehicle.market_data_json,
          cached: true,
          market_checked_at: vehicle.market_checked_at,
        })
      }
    }

    // Validate full address before calling RentCast
    const { address_line1, city, state, zip } = vehicle as {
      address_line1?: string | null
      city?: string | null
      state?: string | null
      zip?: string | null
    }

    if (!address_line1?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
      return NextResponse.json(
        { error: 'Complete the property address before running a CMA' },
        { status: 422 },
      )
    }

    let fullAddress: string
    try {
      fullAddress = buildFullAddress({
        address_line1: address_line1.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
      })
    } catch {
      return NextResponse.json(
        { error: 'Complete the property address before running a CMA' },
        { status: 422 },
      )
    }

    // Call RentCast AVM
    let cmaData
    try {
      cmaData = await fetchCMA(fullAddress, {
        bedrooms:     (vehicle as { bedrooms?: number | null }).bedrooms,
        bathrooms:    (vehicle as { bathrooms?: number | null }).bathrooms,
        sqft:         (vehicle as { sqft?: number | null }).sqft,
        propertyType: (vehicle as { property_type?: string | null }).property_type,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('RENTCAST_API_KEY')) {
        return NextResponse.json(
          { error: 'RentCast is not configured. Contact your administrator.' },
          { status: 503 },
        )
      }
      console.error('[listings/cma] RentCast CMA failed:', msg)
      return NextResponse.json({ error: 'CMA generation failed. Try again later.' }, { status: 502 })
    }

    // Cache result on the vehicles row
    const checkedAt = new Date().toISOString()
    await supabase
      .from('vehicles')
      .update({
        market_data_json:  cmaData,
        market_checked_at: checkedAt,
      })
      .eq('id', id)
      .eq('user_id', profile.org_id)

    return NextResponse.json({ data: cmaData, cached: false, market_checked_at: checkedAt })
  } catch (_err) {
    console.error('[listings/cma] error:', _err instanceof Error ? _err.message : _err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
