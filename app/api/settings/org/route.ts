import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('name, plan, subscription_status')
    .eq('id', profile.org_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, business_phone, business_address, timezone, dealer_cell_number, voice_business_hours_start, voice_business_hours_end, twilio_phone_number, retell_agent_id, gbp_location_id, locations, resend_from_domain')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  // Check if Calendar OAuth token exists (non-null calendar_refresh_token)
  const { data: calendarToken } = await supabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({
    name: org.name,
    plan: org.plan,
    subscription_status: org.subscription_status,
    business_name: settings?.business_name ?? null,
    business_phone: settings?.business_phone ?? null,
    business_address: settings?.business_address ?? null,
    timezone: settings?.timezone ?? 'America/Los_Angeles',
    dealer_cell_number: settings?.dealer_cell_number ?? null,
    voice_business_hours_start: settings?.voice_business_hours_start ?? '09:00',
    voice_business_hours_end: settings?.voice_business_hours_end ?? '19:00',
    twilio_phone_number: settings?.twilio_phone_number ?? null,
    retell_agent_id: settings?.retell_agent_id ?? null,
    gbp_location_id: settings?.gbp_location_id ?? null,
    locations: settings?.locations ?? [],
    resend_from_domain: settings?.resend_from_domain ?? null,
    calendar_connected: !!(calendarToken?.calendar_refresh_token),
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const body: {
    name?: string
    business_name?: string
    business_phone?: string
    business_address?: string
    timezone?: string
    dealer_cell_number?: string
    voice_business_hours_start?: string
    voice_business_hours_end?: string
    gbp_location_id?: string
    locations?: unknown[]
  } = await req.json()

  // Update organizations.name if provided
  if (body.name !== undefined) {
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({ name: body.name, updated_at: new Date().toISOString() })
      .eq('id', profile.org_id)

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }
  }

  // Upsert org_settings with any provided fields
  const settingsPayload: Record<string, string> = {
    org_id: profile.org_id,
    updated_at: new Date().toISOString(),
  }
  if (body.business_name !== undefined) settingsPayload.business_name = body.business_name
  if (body.business_phone !== undefined) settingsPayload.business_phone = body.business_phone
  if (body.business_address !== undefined) settingsPayload.business_address = body.business_address
  if (body.timezone !== undefined) settingsPayload.timezone = body.timezone
  if (body.dealer_cell_number !== undefined) settingsPayload.dealer_cell_number = body.dealer_cell_number
  if (body.voice_business_hours_start !== undefined) settingsPayload.voice_business_hours_start = body.voice_business_hours_start
  if (body.voice_business_hours_end !== undefined) settingsPayload.voice_business_hours_end = body.voice_business_hours_end
  if (body.gbp_location_id !== undefined) settingsPayload.gbp_location_id = body.gbp_location_id
  if (body.locations !== undefined) (settingsPayload as Record<string, unknown>).locations = body.locations

  const hasSettingsUpdate = Object.keys(settingsPayload).length > 2 // more than just org_id + updated_at
  if (hasSettingsUpdate) {
    const { error: settingsErr } = await supabase
      .from('org_settings')
      .upsert(settingsPayload, { onConflict: 'org_id' })

    if (settingsErr) {
      return NextResponse.json({ error: settingsErr.message }, { status: 500 })
    }
  }

  // Return updated data
  const { data: org } = await supabase
    .from('organizations')
    .select('name, plan, subscription_status')
    .eq('id', profile.org_id)
    .single()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, business_phone, business_address, timezone, dealer_cell_number, voice_business_hours_start, voice_business_hours_end, twilio_phone_number, retell_agent_id, gbp_location_id, locations, resend_from_domain')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const { data: calendarToken } = await supabase
    .from('org_google_tokens')
    .select('id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({
    name: org?.name ?? '',
    plan: org?.plan ?? 'trial',
    subscription_status: org?.subscription_status ?? 'trialing',
    business_name: settings?.business_name ?? null,
    business_phone: settings?.business_phone ?? null,
    business_address: settings?.business_address ?? null,
    timezone: settings?.timezone ?? 'America/Los_Angeles',
    dealer_cell_number: settings?.dealer_cell_number ?? null,
    voice_business_hours_start: settings?.voice_business_hours_start ?? '09:00',
    voice_business_hours_end: settings?.voice_business_hours_end ?? '19:00',
    twilio_phone_number: settings?.twilio_phone_number ?? null,
    retell_agent_id: settings?.retell_agent_id ?? null,
    gbp_location_id: settings?.gbp_location_id ?? null,
    locations: settings?.locations ?? [],
    resend_from_domain: settings?.resend_from_domain ?? null,
    calendar_connected: !!calendarToken,
  })
}
