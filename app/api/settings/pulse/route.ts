// app/api/settings/pulse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_settings')
    .select(
      'pulse_enabled, pulse_auto_send_on_sold, pulse_send_day30, pulse_send_day180,' +
      'google_review_url, review_request_enabled, review_request_delay_days, pulse_sms_template'
    )
    .eq('org_id', profile.org_id)
    .maybeSingle()
  return NextResponse.json(data ?? {
    pulse_enabled: false, pulse_auto_send_on_sold: true,
    pulse_send_day30: true, pulse_send_day180: false,
    google_review_url: '', review_request_enabled: false, review_request_delay_days: 0,
    pulse_sms_template: null,
  })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const update: Record<string, unknown> = {}

  // Pulse fields
  if (typeof body.pulse_enabled           === 'boolean') update.pulse_enabled           = body.pulse_enabled
  if (typeof body.pulse_auto_send_on_sold === 'boolean') update.pulse_auto_send_on_sold = body.pulse_auto_send_on_sold
  if (typeof body.pulse_send_day30        === 'boolean') update.pulse_send_day30        = body.pulse_send_day30
  if (typeof body.pulse_send_day180       === 'boolean') update.pulse_send_day180       = body.pulse_send_day180

  // Google review fields
  if (typeof body.google_review_url === 'string') {
    update.google_review_url = body.google_review_url.trim() || null
  }
  if (typeof body.review_request_enabled === 'boolean') {
    update.review_request_enabled = body.review_request_enabled
  }
  if (typeof body.review_request_delay_days === 'number') {
    const days = Math.round(body.review_request_delay_days)
    if (days >= 0 && days <= 365) update.review_request_delay_days = days
  }

  // Custom SMS template (null = use system default)
  if ('pulse_sms_template' in body) {
    const t = body.pulse_sms_template
    update.pulse_sms_template = typeof t === 'string' && t.trim() ? t.trim() : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('org_settings')
    .update(update)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
