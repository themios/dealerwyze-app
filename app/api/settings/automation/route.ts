import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const ALLOWED = [
  'automation_mode', 'lead_response_sla_minutes', 'followup_delay_hours', 'followup_next_day_hour',
  'email_automation_mode', 'email_followup_delay_hours', 'email_followup_next_day_hour',
] as const
type AllowedKey = typeof ALLOWED[number]

const VALID_MODES = ['manual', 'semi_auto', 'full_auto']

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('org_settings')
    .select('automation_mode, lead_response_sla_minutes, followup_delay_hours, followup_next_day_hour, email_automation_mode, email_followup_delay_hours, email_followup_next_day_hour')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({
    automation_mode:              data?.automation_mode              ?? 'manual',
    lead_response_sla_minutes:    data?.lead_response_sla_minutes    ?? 10,
    followup_delay_hours:         data?.followup_delay_hours         ?? 2,
    followup_next_day_hour:       data?.followup_next_day_hour       ?? 10,
    email_automation_mode:        data?.email_automation_mode        ?? 'manual',
    email_followup_delay_hours:   data?.email_followup_delay_hours   ?? 4,
    email_followup_next_day_hour: data?.email_followup_next_day_hour ?? 10,
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as Partial<Record<AllowedKey, string | number>>

  const patch: Record<string, string | number> = {
    org_id: profile.org_id,
    updated_at: new Date().toISOString(),
  }
  for (const key of ALLOWED) {
    if (body[key] !== undefined) patch[key] = body[key] as string | number
  }

  if (patch.automation_mode && !VALID_MODES.includes(patch.automation_mode as string)) {
    return NextResponse.json({ error: 'Invalid automation_mode' }, { status: 400 })
  }
  if (patch.email_automation_mode && !VALID_MODES.includes(patch.email_automation_mode as string)) {
    return NextResponse.json({ error: 'Invalid email_automation_mode' }, { status: 400 })
  }

  await supabase.from('org_settings').upsert(patch, { onConflict: 'org_id' })

  return NextResponse.json({ ok: true })
}
