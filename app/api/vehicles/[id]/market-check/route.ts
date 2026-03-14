import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchMarketCheckStats } from '@/lib/pricing/marketCheck'
import { fetchNhtsaRecalls } from '@/lib/pricing/nhtsa'
import { fetchCompoundMarketIntel } from '@/lib/pricing/groqCompound'
import { fetchSerpapiPricing, parsePricingFromText } from '@/lib/pricing/serpapiPricing'
import { buildMarketIntelligence } from '@/lib/pricing/pricingEngine'

export const maxDuration = 90

const CACHE_TTL_HOURS = 168 // 7 days

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  try {
    const profile = await requireProfile()
    const supabase = await createClientForRequest()

    // Fetch vehicle — must belong to this org
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single()

    if (!vehicle) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Return cached result if fresh AND compound report is present
    if (vehicle.market_checked_at && vehicle.market_data_json) {
      const ageHours = (Date.now() - new Date(vehicle.market_checked_at).getTime()) / 3_600_000
      const hasReport = !!(vehicle.market_data_json as any)?.marketIntelReport
      if (ageHours < CACHE_TTL_HOURS && hasReport) {
        return NextResponse.json({ data: vehicle.market_data_json, cached: true })
      }
    }

    // Fetch org zip for location-aware market queries
    const svc = createServiceClient()
    const { data: orgSettings } = await svc
      .from('org_settings')
      .select('zip_code')
      .eq('org_id', profile.org_id)
      .single()

    const zipCode = orgSettings?.zip_code ?? null
    const mileage = vehicle.mileage ?? 0

    // Run all 4 data sources in parallel
    const [mc, compound, nhtsa, serp] = await Promise.all([
      fetchMarketCheckStats(vehicle.year, vehicle.make, vehicle.model, vehicle.trim, mileage),
      fetchCompoundMarketIntel(vehicle.year, vehicle.make, vehicle.model, vehicle.trim, mileage, zipCode),
      fetchNhtsaRecalls(vehicle.year, vehicle.make, vehicle.model),
      fetchSerpapiPricing(vehicle.year, vehicle.make, vehicle.model, vehicle.trim, mileage, zipCode),
    ])

    // If SerpAPI didn't fire but Compound returned a report, parse pricing from the report text
    const effectiveSerp = serp ?? (compound?.report ? parsePricingFromText(compound.report) : null)
    if (!serp && effectiveSerp) {
      console.log('[market-check] Using pricing parsed from Compound report as serp fallback')
    }

    // Build final intelligence object
    const intelligence = await buildMarketIntelligence(
      vehicle.year, vehicle.make, vehicle.model, mileage,
      mc, nhtsa, compound, effectiveSerp,
    )

    // Determine reliability tier from NHTSA
    const reliabilityTier = deriveReliabilityTier(nhtsa.tier, null)

    // Persist to DB using service client (bypasses RLS for update)
    await svc
      .from('vehicles')
      .update({
        market_data_json:   intelligence,
        market_checked_at:  new Date().toISOString(),
        nhtsa_recall_count: nhtsa.recallCount,
        reliability_tier:   reliabilityTier,
      })
      .eq('id', id)

    return NextResponse.json({ data: intelligence, cached: false })
  } catch (err: any) {
    console.error('[market-check] error:', err?.message)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

function deriveReliabilityTier(
  nhtsa: 'low' | 'moderate' | 'high',
  repairPal: number | null,
): 'low' | 'moderate' | 'high' {
  // NHTSA tier is primary signal; RepairPal score can elevate to moderate
  if (nhtsa === 'high') return 'high'
  if (nhtsa === 'moderate') return 'moderate'
  // NHTSA low — check RepairPal
  if (repairPal !== null && repairPal < 3.0) return 'moderate'
  return 'low'
}
