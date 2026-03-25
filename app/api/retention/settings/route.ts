/**
 * GET  /api/retention/settings  — fetch org retention config
 * PUT  /api/retention/settings  — save retention config
 *
 * Uses .update().eq('org_id') — never upsert (per architecture rules).
 * First-time creation is handled by INSERT if no row exists yet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('retention_settings')
    .select('*')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({ settings: data ?? null })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const VALID_DELIVERY = ['postgrid', 'print_and_mail']
  const VALID_SEQ_FIELDS = [
    'birthday_sequence_id',
    'anniversary_sequence_id',
    'service_due_sequence_id',
    'post_sale_sequence_id',
    'referral_thankyou_sequence_id',
  ]
  const VALID_INT_FIELDS = [
    'birthday_days_before',
    'anniversary_days_before',
    'service_due_days',
    'post_sale_delay_days',
  ]

  const allowed: Record<string, unknown> = {}

  for (const f of VALID_SEQ_FIELDS) {
    if (f in body) allowed[f] = body[f] ?? null
  }

  for (const f of VALID_INT_FIELDS) {
    if (f in body) {
      const v = Number(body[f])
      if (!Number.isInteger(v) || v < 0 || v > 365) {
        return NextResponse.json({ error: `${f} must be an integer between 0 and 365` }, { status: 400 })
      }
      allowed[f] = v
    }
  }

  if ('card_delivery_method' in body) {
    if (!VALID_DELIVERY.includes(body.card_delivery_method as string)) {
      return NextResponse.json({ error: 'Invalid card_delivery_method' }, { status: 400 })
    }
    allowed.card_delivery_method = body.card_delivery_method
  }

  allowed.updated_at = new Date().toISOString()

  // Check if row exists
  const { data: existing } = await supabase
    .from('retention_settings')
    .select('id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('retention_settings')
      .update(allowed)
      .eq('org_id', profile.org_id)
    if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('retention_settings')
      .insert({ ...allowed, org_id: profile.org_id })
    if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
