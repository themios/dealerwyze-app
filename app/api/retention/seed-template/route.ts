/**
 * POST /api/retention/seed-template
 *
 * Creates a single-step sequence from a pre-built retention template and
 * returns the new sequence_id so the caller can auto-link it in retention
 * settings without leaving the page.
 *
 * Body: { trigger_type, channel, name?, subject?, body }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

const VALID_TRIGGERS = [
  'post_sale',
  'birthday',
  'anniversary',
  'service_due',
  'referral_thankyou',
] as const

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { trigger_type, channel, name, subject, body: msgBody } = body as {
    trigger_type?: string
    channel?: string
    name?: string
    subject?: string
    body?: string
  }

  if (!VALID_TRIGGERS.includes(trigger_type as typeof VALID_TRIGGERS[number])) {
    return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 })
  }
  if (!channel || !['sms', 'email'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be sms or email' }, { status: 400 })
  }
  if (!msgBody?.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }
  if (channel === 'email' && !subject?.trim()) {
    return NextResponse.json({ error: 'subject is required for email' }, { status: 400 })
  }

  const supabase = await createClient()

  // Generate a friendly sequence name
  const TRIGGER_LABELS: Record<string, string> = {
    post_sale:           'Post-Sale Thank You',
    birthday:            'Birthday',
    anniversary:         'Sale Anniversary',
    service_due:         'Service Reminder',
    referral_thankyou:   'Referral Thank You',
  }
  const seqName = (name?.trim()) ||
    `${TRIGGER_LABELS[trigger_type!]} – ${channel === 'sms' ? 'SMS' : 'Email'}`

  // 1. Create sequence
  const { data: seq, error: seqErr } = await supabase
    .from('sequences')
    .insert({
      org_id:    profile.org_id,
      name:      seqName,
      channel,
      auto_mode: 'full_auto',
    })
    .select('id')
    .single()

  if (seqErr || !seq) {
    return NextResponse.json({ error: 'Could not create sequence' }, { status: 500 })
  }

  // 2. Create template
  const { data: tmpl, error: tmplErr } = await supabase
    .from('templates')
    .insert({
      org_id:  profile.org_id,
      name:    seqName,
      subject: channel === 'email' ? (subject?.trim() ?? '') : '',
      body:    msgBody.trim(),
      channel,
    })
    .select('id')
    .single()

  if (tmplErr || !tmpl) {
    // Roll back sequence
    await supabase.from('sequences').delete().eq('id', seq.id)
    return NextResponse.json({ error: 'Could not create template' }, { status: 500 })
  }

  // 3. Create sequence step
  const { error: stepErr } = await supabase
    .from('sequence_steps')
    .insert({
      sequence_id: seq.id,
      template_id: tmpl.id,
      sort_order:  0,
      day_offset:  0,
      send_hour:   9,
    })

  if (stepErr) {
    await supabase.from('sequences').delete().eq('id', seq.id)
    await supabase.from('templates').delete().eq('id', tmpl.id)
    return NextResponse.json({ error: 'Could not create step' }, { status: 500 })
  }

  return NextResponse.json(
    { sequence_id: seq.id, sequence_name: seqName, channel },
    { status: 201 },
  )
}
