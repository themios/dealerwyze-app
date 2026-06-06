import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { computePayload } from '@/lib/intelligence/metrics'
import { generateBriefing } from '@/lib/intelligence/claude'
import { fetchMarketSignals } from '@/lib/intelligence/rss'

const MAX_MANUAL_BRIEFINGS_PER_DAY = 3

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const forDate = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('briefings')
    .select('report_json, generated_at, tokens_used')
    .eq('org_id', profile.org_id)
    .eq('for_date', forDate)
    .eq('report_type', 'daily')
    .maybeSingle()

  if (error) {
    console.error('[briefing] GET failed:', error.message)
    return NextResponse.json({ error: 'Failed to load briefing' }, { status: 500 })
  }
  if (!data?.report_json) {
    return NextResponse.json({
      report_json: null,
      generated_at: null,
      tokens_used: 0,
      cached: false,
      no_brief: true,
    })
  }

  return NextResponse.json({
    report_json: data.report_json,
    generated_at: data.generated_at,
    tokens_used: data.tokens_used ?? 0,
    cached: true,
    no_brief: false,
  })
}

export async function POST() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const orgId = profile.org_id
  const forDate = new Date().toISOString().slice(0, 10)

  // Rate-limit manual regeneration to prevent runaway LLM spend
  const { count: usedToday } = await supabase
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('log_date', forDate)
    .eq('event_type', 'manual_brief')

  if ((usedToday ?? 0) >= MAX_MANUAL_BRIEFINGS_PER_DAY) {
    return NextResponse.json(
      { error: 'Daily briefing limit reached. Try again tomorrow.' },
      { status: 429 },
    )
  }

  const { data: org } = await supabase.from('organizations').select('name, vertical').eq('id', orgId).maybeSingle()
  const dealerName = (org?.name as string) ?? 'Dealership'
  const vertical = ((org?.vertical as string) === 'real_estate' ? 'real_estate' : 'dealer') as 'dealer' | 'real_estate'

  const signals = await fetchMarketSignals(4).catch(() => [])
  const payload = await computePayload(supabase, orgId, dealerName, forDate, signals)
  const result = await generateBriefing(payload, vertical)

  // Log usage before writing (failure to log is non-fatal)
  await supabase.from('ai_usage_log').insert({
    org_id: orgId,
    log_date: forDate,
    event_type: 'manual_brief',
    tokens_in: result.tokens_used,
    tokens_out: 0,
    model: 'groq',
  }).then(({ error: logErr }) => {
    if (logErr) console.warn('[briefing] usage log failed:', logErr.message)
  })

  // Upsert avoids a delete+insert window where the briefing is missing
  const { error: upErr } = await supabase.from('briefings').upsert(
    {
      org_id: orgId,
      for_date: forDate,
      report_type: 'daily',
      payload_json: payload as unknown as Record<string, unknown>,
      report_json: result.report_json as unknown as Record<string, unknown>,
      tokens_used: result.tokens_used,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,for_date,report_type' },
  )

  if (upErr) {
    console.error('[briefing] POST upsert failed:', upErr.message)
    return NextResponse.json({ error: 'Failed to save briefing' }, { status: 500 })
  }

  return NextResponse.json({
    report_json: result.report_json,
    generated_at: new Date().toISOString(),
    tokens_used: result.tokens_used,
    cached: false,
  })
}
