import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import {
  buildDealerReflowPrompt,
  buildReReflowPrompt,
} from '@/lib/vehicles/listingOverviewPrompts'
import Groq from 'groq-sdk'

export const maxDuration = 30

interface Params {
  params: Promise<{ id: string }>
}

/**
 * Restructure existing overview copy into sectioned, skimmable text with intentional line breaks.
 * Does not pull new vehicle data — only rewrites layout; facts must stay the same.
 */
export async function POST(req: NextRequest, { params }: Params) {
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
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()
  const isRe = org?.vertical === 'real_estate'

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, ai_description, status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const terminalStatus = isRe ? 'closed' : 'sold'
  if (vehicle.status === terminalStatus) {
    return NextResponse.json(
      { error: isRe ? 'Cannot reflow closed listing' : 'Cannot reflow sold vehicle' },
      { status: 400 },
    )
  }

  let source = vehicle.ai_description?.trim() ?? ''
  try {
    const body = (await req.json().catch(() => null)) as { text?: string } | null
    if (body && typeof body.text === 'string' && body.text.trim()) {
      source = body.text.trim()
    }
  } catch {
    /* use DB */
  }
  if (!source) {
    return NextResponse.json({ error: 'No overview text to reflow' }, { status: 400 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const prompt = isRe ? buildReReflowPrompt(source) : buildDealerReflowPrompt(source)

  let description: string
  try {
    const groq = new Groq({ apiKey })
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_VEHICLE_MODEL ?? 'llama-3.3-70b-versatile',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })
    description = response.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[overview/reflow] Groq error:', msg)
    return NextResponse.json({ error: 'Reflow failed. Try again.' }, { status: 500 })
  }

  if (!description) {
    return NextResponse.json({ error: 'AI returned empty text' }, { status: 500 })
  }

  const { error: updateErr } = await supabase
    .from('vehicles')
    .update({ ai_description: description })
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (updateErr) {
    console.error('[overview/reflow] db error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ description })
}
