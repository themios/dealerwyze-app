import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { sanitizeEmailSignatureHtml } from '@/lib/security/html'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED = [
  'automation_mode', 'lead_response_sla_minutes', 'followup_delay_hours', 'followup_next_day_hour',
  'email_automation_mode', 'email_followup_delay_hours', 'email_followup_next_day_hour',
  'email_signature', 'sms_consent_message',
] as const
type AllowedKey = typeof ALLOWED[number]

const VALID_MODES = ['manual', 'semi_auto', 'full_auto']

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('org_settings')
    .select('automation_mode, lead_response_sla_minutes, followup_delay_hours, followup_next_day_hour, email_automation_mode, email_followup_delay_hours, email_followup_next_day_hour, email_signature, sms_consent_message, auto_respond_email_sequence_id, auto_respond_sms_sequence_id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({
    automation_mode:                   data?.automation_mode                   ?? 'manual',
    lead_response_sla_minutes:         data?.lead_response_sla_minutes         ?? 10,
    followup_delay_hours:              data?.followup_delay_hours              ?? 2,
    followup_next_day_hour:            data?.followup_next_day_hour            ?? 10,
    email_automation_mode:             data?.email_automation_mode             ?? 'manual',
    email_followup_delay_hours:        data?.email_followup_delay_hours        ?? 4,
    email_followup_next_day_hour:      data?.email_followup_next_day_hour      ?? 10,
    email_signature:                   data?.email_signature                   ?? '',
    sms_consent_message:               data?.sms_consent_message               ?? '',
    auto_respond_email_sequence_id:    data?.auto_respond_email_sequence_id    ?? null,
    auto_respond_sms_sequence_id:      data?.auto_respond_sms_sequence_id      ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const supabase = await createClient()
  // Service client used for UUID FK writes (auto_respond sequence IDs) which
  // need to bypass RLS to validate the FK against sequences table
  const serviceSupa = createServiceClient()

  const body = await req.json() as Partial<Record<AllowedKey, string | number | null>> & {
    auto_respond_email_sequence_id?: string | null
    auto_respond_sms_sequence_id?: string | null
  }

  const patch: Record<string, string | number | null> = {
    org_id: profile.org_id,
    updated_at: new Date().toISOString(),
  }
  for (const key of ALLOWED) {
    if (body[key] !== undefined) patch[key] = body[key] as string | number
  }

  if (typeof patch.email_signature === 'string') {
    patch.email_signature = sanitizeEmailSignatureHtml(patch.email_signature)
  }

  // Validate and set auto-respond sequence IDs
  if (body.auto_respond_email_sequence_id !== undefined) {
    if (body.auto_respond_email_sequence_id !== null) {
      const { data: seq } = await serviceSupa
        .from('sequences')
        .select('id, channel')
        .eq('id', body.auto_respond_email_sequence_id)
        .eq('org_id', profile.org_id)
        .maybeSingle()
      if (!seq) return NextResponse.json({ error: 'Email sequence not found' }, { status: 400 })
      if (seq.channel !== 'email') return NextResponse.json({ error: 'Sequence must be an email sequence' }, { status: 400 })
    }
    patch.auto_respond_email_sequence_id = body.auto_respond_email_sequence_id
  }

  if (body.auto_respond_sms_sequence_id !== undefined) {
    if (body.auto_respond_sms_sequence_id !== null) {
      const { data: seq } = await serviceSupa
        .from('sequences')
        .select('id, channel')
        .eq('id', body.auto_respond_sms_sequence_id)
        .eq('org_id', profile.org_id)
        .maybeSingle()
      if (!seq) return NextResponse.json({ error: 'SMS sequence not found' }, { status: 400 })
      if (seq.channel !== 'sms') return NextResponse.json({ error: 'Sequence must be an SMS sequence' }, { status: 400 })
    }
    patch.auto_respond_sms_sequence_id = body.auto_respond_sms_sequence_id
  }

  if (patch.automation_mode && !VALID_MODES.includes(patch.automation_mode as string)) {
    return NextResponse.json({ error: 'Invalid automation_mode' }, { status: 400 })
  }
  if (patch.email_automation_mode && !VALID_MODES.includes(patch.email_automation_mode as string)) {
    return NextResponse.json({ error: 'Invalid email_automation_mode' }, { status: 400 })
  }

  // org_settings RLS blocks INSERT (only UPDATE allowed) — use update(), not upsert()
  // The org_settings row always exists (created by create_org_on_signup trigger)
  await supabase.from('org_settings').update(patch).eq('org_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
