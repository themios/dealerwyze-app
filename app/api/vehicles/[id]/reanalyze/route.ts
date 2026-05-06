import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
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

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(
      'id, year, make, model, trim, color, mileage, price, notes, status, market_data_json, voice_summary, overview_enrichment_text, ai_last_analyzed_at',
    )
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (vehicle.status === 'sold') {
    return NextResponse.json({ error: 'Cannot reanalyze sold vehicle' }, { status: 400 })
  }

  if (vehicle.ai_last_analyzed_at) {
    const ageHours =
      (Date.now() - new Date(vehicle.ai_last_analyzed_at).getTime()) / 3_600_000
    if (ageHours < COOLDOWN_HOURS) {
      const availableAt = new Date(
        new Date(vehicle.ai_last_analyzed_at).getTime() + COOLDOWN_HOURS * 3_600_000
      )
      return NextResponse.json(
        {
          error: `Reanalysis available after ${availableAt.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}`,
          retry_at: availableAt.toISOString(),
        },
        { status: 429 }
      )
    }
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  type MarketData = {
    /** Serp / JSON sources may store FMV as number or numeric string */
    fairMarketPrice?: number | string
    topProblems?: string[]
    marketIntelReport?: string
  }
  const mi = (vehicle.market_data_json ?? {}) as MarketData
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')

  const docContext = vehicle.voice_summary
    ? `\n\nUploaded document summaries (from dealer files — verify):\n${vehicle.voice_summary}`
    : ''

  const enrichmentContext = vehicle.overview_enrichment_text?.trim()
    ? `\n\nDealer-pasted reference text (Carfax/Autocheck/KBB/etc. — verify accuracy, do not invent facts):\n${vehicle.overview_enrichment_text.trim().slice(0, 12_000)}`
    : ''

  const fmvNum =
    typeof mi.fairMarketPrice === 'number' && !Number.isNaN(mi.fairMarketPrice)
      ? mi.fairMarketPrice
      : typeof mi.fairMarketPrice === 'string'
        ? Number(mi.fairMarketPrice.replace(/[^0-9.-]/g, ''))
        : NaN
  const fmvPhrase =
    Number.isFinite(fmvNum) && fmvNum > 0
      ? `\n\nFair market value for this vehicle is approximately $${Math.round(fmvNum).toLocaleString('en-US')}.`
      : ''

  const marketContext = mi.marketIntelReport
    ? `\n\nMarket intelligence:\n${mi.marketIntelReport.slice(0, 1500)}`
    : fmvPhrase

  const problemsContext = mi.topProblems?.length
    ? `\n\nKnown considerations: ${mi.topProblems.slice(0, 3).join('; ')}.`
    : ''

  const prompt = `Write the PUBLIC website overview for a ${vehicleLabel}. Output will be split into short sections for mobile shoppers who skim — not a long paragraph.

Vehicle details:
- Mileage: ${vehicle.mileage ? vehicle.mileage.toLocaleString() + ' miles' : 'not listed'}
- Color: ${vehicle.color ?? 'not specified'}
- Price: ${vehicle.price ? '$' + vehicle.price.toLocaleString() : 'call for price'}
- Dealer notes: ${vehicle.notes ?? 'none'}
${marketContext}${problemsContext}${docContext}${enrichmentContext}

STRICT OUTPUT FORMAT (plain text only):
- 3–5 sections, separated by ONE completely blank line between sections.
- Each section starts with ONE title line: optional emoji, then a short punchy title (max 8 words). Example: "✨ Why it stands out"
- After the title: 2–5 lines. EVERY line must be ONE complete English sentence (clear subject + predicate, starts with a capital letter, ends with . ! or ?).
- NEVER put a phrase, clause, or equipment name alone on its own line (wrong: "Bluetooth connectivity" as its own line). Fold list-like features into full sentences.
- NEVER break one sentence across two lines. If you need more detail, write a second sentence on the next line.
- Honest and transparent — if history is unknown, say so. Do not invent accidents or title brands.
- Use document summaries and pasted reference only for facts they actually state.
- Last section: simple call to action (e.g. "📞 Next step") with 1–2 short sentences.
- No em dashes. No markdown, no "#" headers, no leading "-" bullets.`

  let description: string
  try {
    const groq = new Groq({ apiKey })
    const response = await groq.chat.completions.create({
      // llama-3.1-70b-versatile was decommissioned 2025-01-24 (Groq)
      model: process.env.GROQ_VEHICLE_MODEL ?? 'llama-3.3-70b-versatile',
      max_tokens: 500,
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
  const { error: updateErr } = await supabase
    .from('vehicles')
    .update({ ai_description: description, ai_last_analyzed_at: analyzedAt })
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (updateErr) {
    console.error('[reanalyze] db update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
  }

  return NextResponse.json({ description, analyzed_at: analyzedAt })
}
