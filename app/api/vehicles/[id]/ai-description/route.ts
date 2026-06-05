import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { aiComplete, AI_MODEL } from '@/lib/ai/client'
import {
  formatAreaContextForPrompt,
  resolveAreaContextForListing,
  type AreaContextListingInput,
} from '@/lib/listings/areaContext'
import {
  buildPropertyDetailsBlock,
  buildReMarketplaceBulletsPrompt,
  formatPropertyLabel,
  DEALER_AI_DESCRIPTION_SELECT,
  RE_AI_DESCRIPTION_SELECT,
  type ReListingFields,
} from '@/lib/vehicles/listingOverviewPrompts'

interface Params { params: Promise<{ id: string }> }

interface MarketInsight {
  fairMarketPrice?: number
  topProblems?: string[]
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params

  try {
    const profile = await requireProfile()
    await assertCanUseFeature(profile.org_id, 'ai_reanalyze')
    // Auth client (forRequest): RLS enforces org isolation when reading the vehicle for AI input.
    const supabase = await createClientForRequest()

    // Check org vertical to choose the right prompt path
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()
    const isRe = (org?.vertical as string | null) === 'real_estate'

    const { data: vehicle } = isRe
      ? await supabase
          .from('vehicles')
          .select(RE_AI_DESCRIPTION_SELECT)
          .eq('id', id)
          .eq('user_id', profile.org_id)
          .single()
      : await supabase
          .from('vehicles')
          .select(DEALER_AI_DESCRIPTION_SELECT)
          .eq('id', id)
          .eq('user_id', profile.org_id)
          .single()

    if (!vehicle) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const soldStatus = isRe ? 'closed' : 'sold'
    if (vehicle.status === soldStatus) {
      return NextResponse.json({ error: `Cannot generate description for ${isRe ? 'closed' : 'sold'} listing` }, { status: 400 })
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    // If no pre-computed voice_summary, fetch individual website-scoped document summaries
    let docSummaryText = (vehicle.voice_summary as string | null)?.trim() || ''
    if (!docSummaryText) {
      const { data: docs } = await supabase
        .from('vehicle_documents')
        .select('label, ai_summary')
        .eq('vehicle_id', id)
        .eq('user_id', profile.org_id)
        .eq('document_scope', 'website')
        .not('ai_summary', 'is', null)
      if (docs && docs.length > 0) {
        docSummaryText = docs
          .map(d => `[${d.label}]\n${d.ai_summary}`)
          .join('\n\n')
      }
    }

    const docContext = docSummaryText
      ? isRe
        ? `\n\nUploaded document summaries (disclosures, inspections — use only facts that are explicitly stated):\n${docSummaryText.slice(0, 2000)}`
        : `\n\nUploaded document summaries (Carfax, service records, inspection — use only facts that are explicitly stated):\n${docSummaryText.slice(0, 2000)}`
      : ''

    const mi = (vehicle.market_data_json ?? {}) as MarketInsight
    const pricingContext = mi.fairMarketPrice
      ? `\nEstimated market value is approximately $${mi.fairMarketPrice.toLocaleString()}.`
      : ''
    const problemsContext = mi.topProblems?.length
      ? `\nKnown considerations: ${mi.topProblems.slice(0, 2).join('; ')}.`
      : ''

    let prompt: string
    if (isRe) {
      const areaContextBlock = formatAreaContextForPrompt(
        await resolveAreaContextForListing(vehicle as AreaContextListingInput),
      )
      prompt = buildReMarketplaceBulletsPrompt({
        propertyLabel: formatPropertyLabel(vehicle as ReListingFields),
        detailsBlock: buildPropertyDetailsBlock(vehicle as ReListingFields),
        areaContextBlock,
        pricingContext,
        docContext,
      })
    } else {
      const dealer = vehicle as {
        year?: number | null
        make?: string | null
        model?: string | null
        trim?: string | null
        mileage?: number | null
        color?: string | null
        price?: number | null
        notes?: string | null
      }
      const vehicleLabel = [dealer.year, dealer.make, dealer.model, dealer.trim]
        .filter(Boolean)
        .join(' ')
      prompt = `Write 6–8 bullet points for a ${vehicleLabel} listing on Facebook Marketplace or Craigslist.

Vehicle details:
- Mileage: ${dealer.mileage ? dealer.mileage.toLocaleString() + ' miles' : 'not listed'}
- Color: ${dealer.color ?? 'not specified'}
- Price: ${dealer.price ? '$' + dealer.price.toLocaleString() : 'call for price'}
- Dealer notes: ${dealer.notes ?? 'none'}
${pricingContext}${problemsContext}${docContext}

RULES:
- Output ONLY bullet lines. Start every line with "• " (bullet + space).
- Each bullet: one short phrase or fact, under 12 words. No full paragraphs.
- Cover in order: year/make/model/mileage, price, color if notable, then the most buyer-relevant history facts from documents (owners ≤3, no accidents, clean title, regular maintenance, timing belt/chain, transmission service, brake service — only include facts explicitly found in the documents), last bullet = short call to action.
- If documents are provided, prioritize and surface their key facts — these are the strongest selling points.
- Honest tone. Do not invent service history not stated in the notes or documents.
- No headers, no markdown, no numbered lines, no blank lines between bullets.`
    }

    const response = await aiComplete({
      model: AI_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (response.choices[0]?.message?.content ?? '').trim()
    // Strip any markdown header line (e.g. "# Title\n")
    const description = rawText.replace(/^#+\s+[^\r\n]+[\r\n]+/, '').trim()
    if (!description) {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }

    await supabase
      .from('vehicles')
      .update({ ai_description: description })
      .eq('id', id)
      .eq('user_id', profile.org_id)

    return NextResponse.json({ description })
  } catch (err: unknown) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 402 })
    console.error('[ai-description] error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
