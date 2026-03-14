import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import Anthropic from '@anthropic-ai/sdk'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params

  try {
    const profile = await requireProfile()
    const supabase = await createClientForRequest()

    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, year, make, model, trim, color, mileage, price, notes, status, market_data_json')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single()

    if (!vehicle) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (vehicle.status === 'sold') {
      return NextResponse.json({ error: 'Cannot generate description for sold vehicle' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    const mi: any = vehicle.market_data_json ?? {}

    const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    const pricingContext = mi.fairMarketPrice
      ? `This vehicle is priced competitively — fair market value for this make/model/mileage is around $${mi.fairMarketPrice.toLocaleString()}.`
      : ''
    const problemsContext = mi.topProblems?.length
      ? `Known considerations for this vehicle: ${mi.topProblems.slice(0, 2).join('; ')}.`
      : ''

    const prompt = `Write a professional, engaging vehicle listing description for a ${vehicleLabel}.

Vehicle details:
- Mileage: ${vehicle.mileage ? vehicle.mileage.toLocaleString() + ' miles' : 'mileage not listed'}
- Color: ${vehicle.color ?? 'not specified'}
- Price: ${vehicle.price ? '$' + vehicle.price.toLocaleString() : 'call for price'}
- Notes from dealer: ${vehicle.notes ?? 'none'}
${pricingContext}
${problemsContext}

Requirements:
- 120-160 words
- Enthusiastic but honest tone — no hyperbole
- Lead with the vehicle's strongest appeal (reliability, value, features)
- Include one specific call to action at the end
- No em dashes, no bullet points, no markdown, no headers — flowing prose only
- Do not start with the vehicle name as a title
- Do not mention KBB or book value
- Write as if for a real dealer listing on CarGurus or Cars.com`

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (response.content[0] as any)?.text?.trim() ?? ''
    // Strip any markdown header line (e.g. "# Title\n")
    const description = rawText.replace(/^#+\s+[^\r\n]+[\r\n]+/, '').trim()
    if (!description) {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }

    // Persist to DB
    const svc = createServiceClient()
    await svc
      .from('vehicles')
      .update({ ai_description: description })
      .eq('id', id)

    return NextResponse.json({ description })
  } catch (err: any) {
    console.error('[ai-description] error:', err?.message)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
