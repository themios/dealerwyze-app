import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import {
  formatAreaContextForPrompt,
  mergeAreaContextIntoMarketJson,
  resolveAreaContextForListing,
  type AreaContextListingInput,
} from '@/lib/listings/areaContext'
import {
  buildDealerReanalyzePrompt,
  buildPropertyDetailsBlock,
  buildReReanalyzePrompt,
  DEALER_REANALYZE_SELECT,
  formatPropertyLabel,
  RE_REANALYZE_SELECT,
  type ReListingFields,
} from '@/lib/vehicles/listingOverviewPrompts'
import Groq from 'groq-sdk'

export const maxDuration = 30

const COOLDOWN_HOURS = 4

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const profile = await requireProfile()

  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await assertCanUseFeature(profile.org_id, 'ai_reanalyze')
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    throw err
  }

  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('vertical, plan')
    .eq('id', profile.org_id)
    .maybeSingle()

  const isRe = org?.vertical === 'real_estate'
  const plan = (org?.plan ?? 'free').toLowerCase()
  const skipReanalyzeCooldown = plan === 'lifetime' || plan === 'platform'

  const { data: vehicle } = isRe
    ? await supabase
        .from('vehicles')
        .select(RE_REANALYZE_SELECT)
        .eq('id', id)
        .eq('user_id', profile.org_id)
        .maybeSingle()
    : await supabase
        .from('vehicles')
        .select(DEALER_REANALYZE_SELECT)
        .eq('id', id)
        .eq('user_id', profile.org_id)
        .maybeSingle()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const terminalStatus = isRe ? 'closed' : 'sold'
  if (vehicle.status === terminalStatus) {
    return NextResponse.json(
      { error: isRe ? 'Cannot reanalyze closed listing' : 'Cannot reanalyze sold vehicle' },
      { status: 400 },
    )
  }

  if (!skipReanalyzeCooldown && vehicle.ai_last_analyzed_at) {
    const ageHours =
      (Date.now() - new Date(vehicle.ai_last_analyzed_at).getTime()) / 3_600_000
    if (ageHours < COOLDOWN_HOURS) {
      const availableAt = new Date(
        new Date(vehicle.ai_last_analyzed_at).getTime() + COOLDOWN_HOURS * 3_600_000,
      )
      return NextResponse.json(
        {
          error: `Reanalysis available after ${availableAt.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}`,
          retry_at: availableAt.toISOString(),
        },
        { status: 429 },
      )
    }
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  type MarketData = {
    fairMarketPrice?: number | string
    topProblems?: string[]
    marketIntelReport?: string
  }
  const mi = (vehicle.market_data_json ?? {}) as MarketData

  const docContext = vehicle.voice_summary
    ? isRe
      ? `\n\nUploaded document summaries (disclosures, inspections, floor plans — verify):\n${vehicle.voice_summary}`
      : `\n\nUploaded document summaries (from dealer files — verify):\n${vehicle.voice_summary}`
    : ''

  const enrichmentContext = isRe
    ? (() => {
        const reVehicle = vehicle as ReListingFields & {
          overview_enrichment_text?: string | null
        }
        const reInternalNotes = [reVehicle.notes?.trim(), reVehicle.overview_enrichment_text?.trim()]
          .filter(Boolean)
          .join('\n\n')
        return reInternalNotes
          ? `\n\nINTERNAL realtor notes (for your eyes only — never publish warnings or deficiencies; use only verified positive facts in the public overview):\n${reInternalNotes.slice(0, 12_000)}`
          : ''
      })()
    : (() => {
        const dealerVehicle = vehicle as { overview_enrichment_text?: string | null }
        return dealerVehicle.overview_enrichment_text?.trim()
          ? `\n\nDealer-pasted reference text (Carfax/Autocheck/KBB/etc. — verify accuracy, do not invent facts):\n${dealerVehicle.overview_enrichment_text.trim().slice(0, 12_000)}`
          : ''
      })()

  const fmvNum =
    typeof mi.fairMarketPrice === 'number' && !Number.isNaN(mi.fairMarketPrice)
      ? mi.fairMarketPrice
      : typeof mi.fairMarketPrice === 'string'
        ? Number(mi.fairMarketPrice.replace(/[^0-9.-]/g, ''))
        : NaN
  const fmvPhrase =
    Number.isFinite(fmvNum) && fmvNum > 0
      ? isRe
        ? `\n\nEstimated market value is approximately $${Math.round(fmvNum).toLocaleString('en-US')}.`
        : `\n\nFair market value for this vehicle is approximately $${Math.round(fmvNum).toLocaleString('en-US')}.`
      : ''

  const marketContext = mi.marketIntelReport
    ? `\n\nMarket intelligence:\n${mi.marketIntelReport.slice(0, 1500)}`
    : fmvPhrase

  const problemsContext =
    !isRe && mi.topProblems?.length
      ? `\n\nKnown considerations: ${mi.topProblems.slice(0, 3).join('; ')}.`
      : ''

  let areaContextForCache: Awaited<ReturnType<typeof resolveAreaContextForListing>> = null

  let prompt: string
  if (isRe) {
    const reVehicle = vehicle as ReListingFields & { agent_notes?: string | null }
    areaContextForCache = await resolveAreaContextForListing(reVehicle as AreaContextListingInput)
    const areaContextBlock = formatAreaContextForPrompt(areaContextForCache)
    prompt = buildReReanalyzePrompt({
      propertyLabel: formatPropertyLabel(reVehicle),
      detailsBlock: buildPropertyDetailsBlock(reVehicle),
      areaContextBlock,
      marketContext,
      docContext,
      enrichmentContext,
    })
  } else {
    const dealerVehicle = vehicle as {
      year?: number | null
      make?: string | null
      model?: string | null
      trim?: string | null
      mileage?: number | null
      color?: string | null
      price?: number | null
      notes?: string | null
    }
    const vehicleLabel = [dealerVehicle.year, dealerVehicle.make, dealerVehicle.model, dealerVehicle.trim]
      .filter(Boolean)
      .join(' ')
    prompt = buildDealerReanalyzePrompt({
      vehicleLabel,
      mileage: dealerVehicle.mileage ?? null,
      color: dealerVehicle.color ?? null,
      price: dealerVehicle.price ?? null,
      notes: dealerVehicle.notes ?? null,
      marketContext,
      problemsContext,
      docContext,
      enrichmentContext,
    })
  }

  let description: string
  try {
    const groq = new Groq({ apiKey })
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_VEHICLE_MODEL ?? 'llama-3.3-70b-versatile',
      max_tokens: isRe ? 700 : 500,
      messages: [{ role: 'user', content: prompt }],
    })
    description = response.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[reanalyze] Groq error:', msg)
    const isModel =
      /model_decommissioned|model_not_found|decommissioned|invalid_request_error/i.test(msg)
    return NextResponse.json(
      {
        error: isModel
          ? 'AI model is outdated or unavailable. Set GROQ_VEHICLE_MODEL in deployment env or contact support.'
          : 'Analysis failed. Please try again.',
      },
      { status: 500 },
    )
  }

  if (!description) {
    return NextResponse.json({ error: 'Analysis produced no output' }, { status: 500 })
  }

  const analyzedAt = new Date().toISOString()
  const updatePayload: {
    ai_description: string
    ai_last_analyzed_at: string
    market_data_json?: Record<string, unknown>
  } = { ai_description: description, ai_last_analyzed_at: analyzedAt }
  if (isRe && areaContextForCache) {
    updatePayload.market_data_json = mergeAreaContextIntoMarketJson(
      vehicle.market_data_json,
      areaContextForCache,
    )
  }

  const { error: updateErr } = await supabase
    .from('vehicles')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (updateErr) {
    console.error('[reanalyze] db update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
  }

  return NextResponse.json({ description, analyzed_at: analyzedAt })
}
