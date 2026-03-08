import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { provisionVoiceAgent, deprovisionVoiceAgent } from '@/lib/voice/provision'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

/**
 * POST /api/admin/provision-voice
 * Creates a Retell LLM + agent for an org and links their Twilio number.
 * Requires the org to have a provisioned Twilio number (Phase 3A).
 *
 * Body: { org_id? }  — defaults to caller's own org
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const supabase = createServiceClient()
  const body     = await req.json() as { org_id?: string }
  const orgId    = body.org_id ?? profile.org_id

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('twilio_phone_number, dealer_cell_number, voice_business_hours_start, voice_business_hours_end')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!settings?.twilio_phone_number) {
    return NextResponse.json(
      { error: 'Add a business phone number first in Settings → Organization (SMS Phone Number). Then you can turn on the AI voice agent.' },
      { status: 400 },
    )
  }

  try {
    const result = await provisionVoiceAgent(orgId, {
      businessName: org?.name ?? 'Dealer',
      phoneNumber:  settings.twilio_phone_number,
      hoursStart:   settings.voice_business_hours_start ?? '09:00',
      hoursEnd:     settings.voice_business_hours_end   ?? '19:00',
      dealerCell:   settings.dealer_cell_number         ?? '',
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

/**
 * DELETE /api/admin/provision-voice
 * Removes the Retell agent + LLM + phone link for an org.
 *
 * Body: { org_id? }  — defaults to caller's own org
 */
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const body  = await req.json() as { org_id?: string }
  const orgId = body.org_id ?? profile.org_id

  await deprovisionVoiceAgent(orgId)
  return NextResponse.json({ ok: true })
}
