import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { computePayload } from '@/lib/intelligence/metrics'
import { fetchMarketSignals } from '@/lib/intelligence/rss'

export const maxDuration = 60

// GET: return today's briefing (generate lazily if not cached)
export async function GET(req: Request) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  const { searchParams } = new URL(req.url)
  const forDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  // Check cache
  const { data: cached } = await supabase
    .from('briefings')
    .select('report_json, generated_at, tokens_used')
    .eq('org_id', orgId)
    .eq('for_date', forDate)
    .eq('report_type', 'daily')
    .maybeSingle()

  if (cached) {
    return NextResponse.json({ ...cached, cached: true })
  }

  // Generate fresh
  return await generateAndCache(supabase, orgId, forDate)
}

// POST: force regenerate (ignore cache)
export async function POST() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id
  const forDate = new Date().toISOString().slice(0, 10)

  // Delete existing cache for today
  await supabase
    .from('briefings')
    .delete()
    .eq('org_id', orgId)
    .eq('for_date', forDate)
    .eq('report_type', 'daily')

  return await generateAndCache(supabase, orgId, forDate)
}

async function generateAndCache(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, forDate: string) {
  // Fetch dealer name from org settings
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  const dealerName = org?.name ?? 'Your Dealership'

  // Fetch market signals (RSS, non-blocking)
  const signals = await fetchMarketSignals(4).catch(() => [])

  // Compute structured payload
  const payload = await computePayload(supabase, orgId, dealerName, forDate, signals)

  // Call LLM — dynamic import so Groq SDK is never bundled in client
  let result
  try {
    const { generateBriefing } = await import('@/lib/intelligence/claude')
    result = await generateBriefing(payload)
  } catch (err) {
    return NextResponse.json(
      { error: 'AI generation failed', detail: String(err) },
      { status: 500 }
    )
  }

  // Cache in DB
  await supabase.from('briefings').upsert({
    org_id: orgId,
    for_date: forDate,
    report_type: 'daily',
    payload_json: payload,
    report_json: result.report_json,
    tokens_used: result.tokens_used,
    generated_at: new Date().toISOString(),
  })

  return NextResponse.json({
    report_json: result.report_json,
    generated_at: new Date().toISOString(),
    tokens_used: result.tokens_used,
    cached: false,
  })
}
