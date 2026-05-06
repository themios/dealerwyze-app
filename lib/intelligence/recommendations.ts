/**
 * DMAIC Phase 3: Rule-based recommendation generator.
 * Called from runDailyIntelligence — service role only. Never call from user-facing routes.
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assessPricing, RATING_LABEL } from '@/lib/pricing/pricingAssessment'

const TTL_HOURS = 48

function expiresAt(): string {
  return new Date(Date.now() + TTL_HOURS * 3_600_000).toISOString()
}

function fmtMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function fmtMiles(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return '—'
  return `${Math.round(n).toLocaleString('en-US')} miles`
}

type MarketIntel = {
  fastSalePrice?: number | null
  fairMarketPrice?: number | null
  maxReturnPrice?: number | null
  confidence?: 'high' | 'medium' | 'low' | 'insufficient' | string | null
  nComps?: number | null
  fmvRangeLow?: number | null
  fmvRangeHigh?: number | null
  avgDom?: number | null
  sources?: string[] | null
  marketIntelReport?: string | null
}

interface Rec {
  org_id: string
  type: 'lead' | 'inventory' | 'acquisition' | 'operational' | 'timing'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  body: string
  evidence?: Record<string, unknown>
  entity_type?: 'lead' | 'vehicle' | 'staff' | 'org'
  entity_id?: string | null
  expires_at: string
}

async function purgeStale(supabase: SupabaseClient, orgId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  await supabase
    .from('recommendations')
    .delete()
    .eq('org_id', orgId)
    .lt('expires_at', cutoff)
}

async function insert(supabase: SupabaseClient, recs: Rec[]): Promise<number> {
  if (!recs.length) return 0
  const { error } = await supabase.from('recommendations').insert(recs)
  if (error) console.error('[recommendations] insert failed:', error.message)
  return error ? 0 : recs.length
}

// ── Rule: ghost leads (inbound email/SMS with no reply, 48+ hours old) ──
async function ruleGhostLeads(supabase: SupabaseClient, orgId: string): Promise<Rec[]> {
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString()
  const { data } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', orgId)
    .in('type', ['email', 'sms'])
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('addressed_at', null)
    .lt('created_at', cutoff)
    .limit(50)

  const count = data?.length ?? 0
  if (count === 0) return []

  return [{
    org_id: orgId,
    type: 'lead',
    priority: count >= 5 ? 'critical' : 'high',
    title: `${count} lead${count === 1 ? '' : 's'} unanswered for 48+ hours`,
    body: `You have ${count} inbound lead${count === 1 ? '' : 's'} with no response in over 48 hours. Leads that go cold this long rarely convert. Go to your Today queue, filter by "pending", and work through these now.`,
    evidence: { stale_lead_count: count },
    entity_type: 'org',
    entity_id: null,
    expires_at: expiresAt(),
  }]
}

// ── Rule: slow average response time ──
async function ruleResponseTime(supabase: SupabaseClient, orgId: string): Promise<Rec[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    supabase.from('activities').select('customer_id, created_at')
      .eq('user_id', orgId).in('type', ['email', 'sms']).eq('direction', 'inbound')
      .gte('created_at', since).limit(200),
    supabase.from('activities').select('customer_id, created_at')
      .eq('user_id', orgId).in('type', ['email', 'sms']).eq('direction', 'outbound')
      .gte('created_at', since).limit(500),
  ])

  if (!inbound?.length || !outbound?.length) return []

  // Index outbound timestamps by customer
  const byCustomer: Record<string, number[]> = {}
  for (const o of outbound) {
    if (!o.customer_id) continue
    ;(byCustomer[o.customer_id as string] ??= []).push(new Date(o.created_at as string).getTime())
  }

  const times: number[] = []
  for (const msg of inbound) {
    const cid = msg.customer_id as string
    if (!cid) continue
    const inAt = new Date(msg.created_at as string).getTime()
    const first = (byCustomer[cid] ?? []).filter(t => t > inAt).sort((a, b) => a - b)[0]
    if (first) times.push((first - inAt) / 60_000)
  }

  if (times.length < 5) return []

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  if (avg <= 15) return []

  return [{
    org_id: orgId,
    type: 'operational',
    priority: avg > 120 ? 'critical' : avg > 60 ? 'high' : 'medium',
    title: `Average lead response time is ${avg} minutes`,
    body: `Leads answered within 15 minutes are far more likely to book an appointment. Your team averaged ${avg} min over the last 7 days. Set a team rule: reply to every new lead within 15 minutes, even if just to say "we'll call you shortly."`,
    evidence: { avg_response_minutes: avg, sample_size: times.length },
    entity_type: 'org',
    entity_id: null,
    expires_at: expiresAt(),
  }]
}

// ── Rule: inventory aging ──
async function ruleInventoryAging(supabase: SupabaseClient, orgId: string): Promise<Rec[]> {
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select(
      'id, year, make, model, trim, price, mileage, created_at, purchased_at, market_data_json, lead_count_30d, appt_conversion_rate',
    )
    .eq('user_id', orgId).eq('status', 'available').limit(200)

  if (!vehicles?.length) return []

  const recs: Rec[] = []
  const aged = vehicles
    .map(v => {
      const base = (v.purchased_at || v.created_at) as string
      const days = Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000)
      return { ...v, days }
    })
    .filter(v => v.days >= 45)
    .sort((a, b) => b.days - a.days)
    .slice(0, 4)

  for (const v of aged) {
    const label = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`
    const listPrice = typeof v.price === 'number' ? v.price : null
    const miles = typeof v.mileage === 'number' ? v.mileage : null
    const intel = (v.market_data_json ?? null) as MarketIntel | null
    const pricing = listPrice && intel ? assessPricing(listPrice, intel) : null
    const leads30d = typeof v.lead_count_30d === 'number' ? v.lead_count_30d : 0
    const conv = typeof v.appt_conversion_rate === 'number' ? v.appt_conversion_rate : null

    const fmv = intel?.fairMarketPrice ?? null
    const fmvLow = intel?.fmvRangeLow ?? null
    const fmvHigh = intel?.fmvRangeHigh ?? null
    const avgDom = intel?.avgDom ?? null
    const nComps = intel?.nComps ?? null
    const confidence = intel?.confidence ?? null

    const marketLine =
      intel && fmv
        ? `Market comps suggest FMV ~${fmtMoney(fmv)} (range ${fmtMoney(fmvLow)}–${fmtMoney(fmvHigh)}${avgDom ? `, avg DOM ${avgDom}d` : ''}${nComps ? `, ${nComps} comps` : ''}${confidence ? `, ${String(confidence)}` : ''}).`
        : `No market comps cached yet. Run “Market Intelligence” on this vehicle to pull local pricing ranges, then revisit price.`

    // Concrete action depends on pricing + velocity signals.
    let actionLine = ''
    if (pricing && pricing.rating !== 'no_data') {
      const deltaPct = Math.round(pricing.pctDelta)
      const ratingLabel = RATING_LABEL[pricing.rating]

      if (pricing.rating === 'overpriced' || pricing.rating === 'high') {
        // Use a more aggressive target when it's aged with low lead volume.
        const wantFast = v.days >= 60 || leads30d <= 1
        const target =
          wantFast
            ? (intel?.fastSalePrice ?? pricing.suggestedPrice ?? pricing.fairMarketPrice)
            : (pricing.suggestedPrice ?? pricing.fairMarketPrice)
        const roundedTarget = typeof target === 'number' ? Math.round(target / 100) * 100 : null

        actionLine = roundedTarget
          ? `Pricing is ${ratingLabel} (${deltaPct}% vs FMV). To move it, test dropping to ${fmtMoney(roundedTarget)} for 7 days, then reassess leads.`
          : `Pricing is ${ratingLabel} (${deltaPct}% vs FMV). Consider a price drop toward FMV to restore traffic.`
      } else if (pricing.rating === 'underpriced') {
        actionLine =
          `Pricing is ${ratingLabel} (${deltaPct}% vs FMV). You can raise price toward ${fmtMoney(pricing.fairMarketPrice)} ` +
          `or keep it as a “great deal” and push ads aggressively to convert attention into appointments.`
      } else {
        actionLine =
          `Pricing is ${ratingLabel} (${deltaPct}% vs FMV). This likely isn’t a pricing issue — focus on merchandising and follow-up.`
      }
    } else {
      actionLine =
        listPrice
          ? `Current list price is ${fmtMoney(listPrice)}. Without comps, start with a relist refresh and consider a small test drop ($300–$500) if leads stay flat.`
          : `List price is missing — set a price first, then re-run recommendations.`
    }

    const marketingLine =
      leads30d <= 1
        ? `Marketing playbook: refresh the first photo + headline, relist on FB Marketplace, and post a short 10–15s walkaround to IG/FB. If you have prior similar-vehicle shoppers, send a “price refresh / still available” SMS.`
        : conv != null && conv < 0.08
          ? `Conversion playbook: you’re getting attention but not visits — tighten CTA (“Book a test drive today”), reply within 15 minutes, and offer a simple incentive (e.g. hold fee / same-day appointment).`
          : `Quick wins: refresh listing photos, ensure the first 2 images are bright exterior + interior, and repost to Marketplace with 3 key bullets (miles, clean title status if known, financing available).`

    recs.push({
      org_id: orgId,
      type: 'inventory',
      priority: v.days >= 60 ? 'high' : 'medium',
      title: `${label} is ${v.days} days on lot`,
      body:
        `The ${label} has been on your lot for ${v.days} days (${fmtMiles(miles)}; listed at ${fmtMoney(listPrice)}). ` +
        `${marketLine} ${actionLine} ${marketingLine}`,
      evidence: {
        days_on_lot: v.days,
        list_price: listPrice,
        mileage: miles,
        market: intel
          ? {
              fairMarketPrice: intel.fairMarketPrice ?? null,
              fmvRangeLow: intel.fmvRangeLow ?? null,
              fmvRangeHigh: intel.fmvRangeHigh ?? null,
              fastSalePrice: intel.fastSalePrice ?? null,
              maxReturnPrice: intel.maxReturnPrice ?? null,
              avgDom: intel.avgDom ?? null,
              nComps: intel.nComps ?? null,
              confidence: intel.confidence ?? null,
              sources: intel.sources ?? null,
            }
          : null,
        pricing_assessment: pricing
          ? { rating: pricing.rating, pctDelta: pricing.pctDelta, suggestedPrice: pricing.suggestedPrice }
          : null,
        lead_count_30d: leads30d,
        appt_conversion_rate: conv,
      },
      entity_type: 'vehicle',
      entity_id: v.id as string,
      expires_at: expiresAt(),
    })
  }

  return recs
}

// ── Rule: high inquiry count, zero appointments (price signal) ──
async function ruleHighInterestNoConversion(supabase: SupabaseClient, orgId: string): Promise<Rec[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim, price, mileage, market_data_json')
    .eq('user_id', orgId).eq('status', 'available')

  if (!vehicles?.length) return []

  const vids = vehicles.map(v => v.id as string)
  const { data: acts } = await supabase
    .from('activities').select('vehicle_id, type')
    .in('vehicle_id', vids).eq('user_id', orgId).gte('created_at', since)

  if (!acts?.length) return []

  const inquiries: Record<string, number> = {}
  const appts: Record<string, number> = {}
  for (const a of acts) {
    const vid = a.vehicle_id as string
    if (!vid) continue
    if (a.type === 'email') inquiries[vid] = (inquiries[vid] ?? 0) + 1
    if (a.type === 'appointment') appts[vid] = (appts[vid] ?? 0) + 1
  }

  const recs: Rec[] = []
  for (const v of vehicles) {
    const vid = v.id as string
    const inq = inquiries[vid] ?? 0
    if (inq >= 8 && !appts[vid]) {
      const label = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`
      const listPrice = typeof v.price === 'number' ? v.price : null
      const miles = typeof v.mileage === 'number' ? v.mileage : null
      const intel = (v.market_data_json ?? null) as MarketIntel | null
      const pricing = listPrice && intel ? assessPricing(listPrice, intel) : null

      const priceMove =
        pricing && pricing.rating !== 'no_data'
          ? (pricing.rating === 'overpriced' || pricing.rating === 'high'
              ? (intel?.fastSalePrice ?? pricing.suggestedPrice ?? pricing.fairMarketPrice)
              : null)
          : null
      const roundedMove = typeof priceMove === 'number' ? Math.round(priceMove / 100) * 100 : null

      const marketSnippet =
        intel?.fairMarketPrice
          ? `FMV ~${fmtMoney(intel.fairMarketPrice)} (range ${fmtMoney(intel.fmvRangeLow)}–${fmtMoney(intel.fmvRangeHigh)}${intel.nComps ? `, ${intel.nComps} comps` : ''}).`
          : `No market comps cached yet — run “Market Intelligence” to pull a price range for your area.`

      const actionSnippet =
        roundedMove
          ? `Action: test ${fmtMoney(roundedMove)} for 7 days, and add “Book today” CTA + financing line to the first 2 photos/caption.`
          : `Action: respond within 15 minutes, add a clear “Book a test drive” CTA, and test a $300–$500 drop if appointments stay at 0.`

      recs.push({
        org_id: orgId,
        type: 'inventory',
        priority: inq >= 15 ? 'high' : 'medium',
        title: `${label} has ${inq} inquiries but no appointments`,
        body:
          `The ${label} (${fmtMiles(miles)}; listed at ${fmtMoney(listPrice)}) has strong interest — ${inq} inquiries in 30 days — but 0 appointments. ` +
          `${marketSnippet} ${actionSnippet}`,
        evidence: {
          inquiries_30d: inq,
          appointments_30d: 0,
          list_price: listPrice,
          mileage: miles,
          market: intel
            ? {
                fairMarketPrice: intel.fairMarketPrice ?? null,
                fmvRangeLow: intel.fmvRangeLow ?? null,
                fmvRangeHigh: intel.fmvRangeHigh ?? null,
                fastSalePrice: intel.fastSalePrice ?? null,
                maxReturnPrice: intel.maxReturnPrice ?? null,
                avgDom: intel.avgDom ?? null,
                nComps: intel.nComps ?? null,
                confidence: intel.confidence ?? null,
                sources: intel.sources ?? null,
              }
            : null,
          pricing_assessment: pricing
            ? { rating: pricing.rating, pctDelta: pricing.pctDelta, suggestedPrice: pricing.suggestedPrice }
            : null,
          suggested_test_price: roundedMove,
        },
        entity_type: 'vehicle',
        entity_id: vid,
        expires_at: expiresAt(),
      })
    }
  }

  return recs.slice(0, 3)
}

// ── Rule: best outreach timing from messaging pattern cache ──
async function ruleTiming(supabase: SupabaseClient, orgId: string): Promise<Rec[]> {
  const { data: settings, error } = await supabase
    .from('org_settings').select('performance_cache').eq('org_id', orgId).maybeSingle()

  if (error || !settings) return []

  const cache = (settings.performance_cache ?? {}) as Record<string, unknown>
  const buckets = (cache.messagingPatterns as {
    responseTimeBuckets?: Array<{ hour: number; sampleSize: number; replyRate: number }>
  })?.responseTimeBuckets?.filter(b => b.sampleSize >= 10) ?? []

  if (buckets.length < 4) return []

  const sorted = [...buckets].sort((a, b) => b.replyRate - a.replyRate)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  if (best.replyRate - worst.replyRate < 0.1) return []

  function label(h: number): string {
    const n = ((h % 24) + 24) % 24
    const s = n >= 12 ? 'pm' : 'am'
    const d = n % 12 === 0 ? 12 : n % 12
    return `${d}${s}`
  }

  return [{
    org_id: orgId,
    type: 'timing',
    priority: 'medium',
    title: `Best time to reach out: ${label(best.hour)}`,
    body: `Based on your actual messaging history, outreach at ${label(best.hour)} gets a ${Math.round(best.replyRate * 100)}% reply rate. Avoid ${label(worst.hour)} (${Math.round(worst.replyRate * 100)}% reply rate). Schedule your follow-up queue accordingly.`,
    evidence: { best_hour: best.hour, best_reply_rate: best.replyRate, worst_hour: worst.hour, worst_reply_rate: worst.replyRate },
    entity_type: 'org',
    entity_id: null,
    expires_at: expiresAt(),
  }]
}

// ── Main export ──
export async function generateRecommendationsForOrg(orgId: string): Promise<{ written: number }> {
  const supabase = createServiceClient()

  await purgeStale(supabase, orgId)

  const [ghostRecs, responseRecs, agingRecs, interestRecs, timingRecs] = await Promise.all([
    ruleGhostLeads(supabase, orgId),
    ruleResponseTime(supabase, orgId),
    ruleInventoryAging(supabase, orgId),
    ruleHighInterestNoConversion(supabase, orgId),
    ruleTiming(supabase, orgId),
  ])

  // Priority order: ghost leads first (most urgent)
  const all = [...ghostRecs, ...responseRecs, ...agingRecs, ...interestRecs, ...timingRecs]
  const written = await insert(supabase, all)
  return { written }
}
