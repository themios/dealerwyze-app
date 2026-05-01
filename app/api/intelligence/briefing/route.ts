import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { computePayload } from '@/lib/intelligence/metrics'
import { generateBriefing } from '@/lib/intelligence/claude'
import { fetchMarketSignals } from '@/lib/intelligence/rss'

export async function GET() {
  const profile = await getProfile()
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data?.report_json) {
    return NextResponse.json({ error: 'No briefing for today' }, { status: 404 })
  }

  return NextResponse.json({
    report_json: data.report_json,
    generated_at: data.generated_at,
    tokens_used: data.tokens_used ?? 0,
    cached: true,
  })
}

export async function POST() {
  const profile = await getProfile()
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClientForRequest()
  const orgId = profile.org_id
  const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
  const dealerName = (org?.name as string) ?? 'Dealership'
  const forDate = new Date().toISOString().slice(0, 10)

  const signals = await fetchMarketSignals(4).catch(() => [])
  const payload = await computePayload(supabase, orgId, dealerName, forDate, signals)
  const result = await generateBriefing(payload)

  await supabase
    .from('briefings')
    .delete()
    .eq('org_id', orgId)
    .eq('for_date', forDate)
    .eq('report_type', 'daily')

  const { error: upErr } = await supabase.from('briefings').insert({
    org_id: orgId,
    for_date: forDate,
    report_type: 'daily',
    payload_json: payload as unknown as Record<string, unknown>,
    report_json: result.report_json as unknown as Record<string, unknown>,
    tokens_used: result.tokens_used,
    generated_at: new Date().toISOString(),
  })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({
    report_json: result.report_json,
    generated_at: new Date().toISOString(),
    tokens_used: result.tokens_used,
    cached: false,
  })
}
