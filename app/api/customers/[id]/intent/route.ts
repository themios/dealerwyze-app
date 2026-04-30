import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { buildManualLeadIntent, normalizeLeadIntentFlags, type LeadIntentTier } from '@/lib/leads/intent'

const VALID_TIERS: LeadIntentTier[] = ['standard', 'active', 'warm', 'hot']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id } = await params
  const supabase = await createClient()

  const body = await req.json().catch(() => null) as {
    tier?: LeadIntentTier
    flags?: string[]
    note?: string | null
  } | null

  if (!body || !body.tier || !VALID_TIERS.includes(body.tier)) {
    return NextResponse.json({ error: 'Invalid intent tier' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const intent = buildManualLeadIntent({
    tier: body.tier,
    flags: normalizeLeadIntentFlags(body.flags),
    note: typeof body.note === 'string' ? body.note.trim() : null,
  })

  const patch: Record<string, unknown> = {
    lead_intent_score: intent.score,
    lead_intent_tier: intent.tier,
    lead_intent_flags: intent.flags,
    lead_intent_summary: intent.summary,
    lead_intent_source: intent.source,
    lead_intent_manual_note: intent.manualNote,
    lead_intent_updated_at: intent.updatedAt,
  }

  if (intent.tier === 'hot') patch.lead_rating = 'hot'

  const { error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, intent })
}
