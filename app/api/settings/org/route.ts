import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { writeAuditLog } from '@/lib/audit/log'
import { sanitizeLeadSourceEmailMatchers } from '@/lib/leads/sourceMatchers'

export async function GET() {
  const profile = await requireProfile()
  // Service client used for org_settings read only — RLS on org_settings
  // unexpectedly blocks reads after org_id migration (root cause: get_org_id()
  // mismatch between auth.uid() and migrated org_id). All queries are explicitly
  // filtered by profile.org_id from requireProfile(), so tenant isolation holds.
  const supabase = createServiceClient()
  const authedSupabase = await createClient()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('name, plan, subscription_status, vertical')
    .eq('id', profile.org_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  const { data: settings, error: settingsReadErr } = await supabase
    .from('org_settings')
    .select('business_name, business_phone, business_address, zip_code, timezone, dealer_cell_number, voice_business_hours_start, voice_business_hours_end, twilio_phone_number, retell_agent_id, gbp_location_id, locations, resend_from_domain, dealer_website_url, dealer_website_inventory_path, lead_assignment_mode, lead_source_email_matchers')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  // Check if Calendar OAuth token exists (non-null calendar_refresh_token)
  const { data: calendarToken } = await authedSupabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (settingsReadErr) {
    console.error('[settings/org GET] query error:', settingsReadErr.message, 'org_id:', profile.org_id)
    return NextResponse.json({ error: 'Failed to load org settings' }, { status: 500 })
  }

  return NextResponse.json({
    name: org.name,
    plan: org.plan,
    subscription_status: org.subscription_status,
    vertical: (org.vertical ?? 'dealer') as 'dealer' | 'real_estate',
    business_name: settings?.business_name ?? null,
    business_phone: settings?.business_phone ?? null,
    business_address: settings?.business_address ?? null,
    zip_code: settings?.zip_code ?? null,
    timezone: settings?.timezone ?? 'America/Los_Angeles',
    dealer_cell_number: settings?.dealer_cell_number ?? null,
    voice_business_hours_start: settings?.voice_business_hours_start ?? '09:00',
    voice_business_hours_end: settings?.voice_business_hours_end ?? '19:00',
    twilio_phone_number: settings?.twilio_phone_number ?? null,
    retell_agent_id: settings?.retell_agent_id ?? null,
    gbp_location_id: settings?.gbp_location_id ?? null,
    locations: settings?.locations ?? [],
    resend_from_domain: settings?.resend_from_domain ?? null,
    dealer_website_url: settings?.dealer_website_url ?? null,
    dealer_website_inventory_path: settings?.dealer_website_inventory_path ?? '/cars-for-sale',
    calendar_connected: !!(calendarToken?.calendar_refresh_token),
    lead_assignment_mode: settings?.lead_assignment_mode ?? 'owner',
    lead_source_email_matchers: sanitizeLeadSourceEmailMatchers(settings?.lead_source_email_matchers),
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  // Service client required: same RLS issue as GET — org_settings UPDATE blocked
  // by auth.uid() mismatch after org_id migration. All queries are explicitly
  // filtered by profile.org_id from requireProfile(), so tenant isolation holds.
  const supabase = createServiceClient()

  const body: {
    name?: string
    business_name?: string
    business_phone?: string
    business_address?: string
    zip_code?: string
    timezone?: string
    dealer_cell_number?: string
    voice_business_hours_start?: string
    voice_business_hours_end?: string
    gbp_location_id?: string
    locations?: unknown[]
    dealer_website_url?: string
    dealer_website_inventory_path?: string
    postgrid_api_key?: string | null
    stripe_dealer_publishable_key?: string | null
    stripe_dealer_secret_key?: string | null
    booking_enabled?: boolean
    booking_intro_text?: string
    google_review_url?: string | null
    review_request_enabled?: boolean
    review_request_delay_days?: number
    lead_assignment_mode?: string
    lead_assignment_rep_index?: number
    lead_source_email_matchers?: unknown[]
  } = await req.json()

  // Update organizations.name if provided and non-empty (empty string means the form field was blank, not an intentional clear)
  if (body.name !== undefined && body.name.trim() !== '') {
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({ name: body.name, updated_at: new Date().toISOString() })
      .eq('id', profile.org_id)

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }
  }

  // Update org_settings with any provided fields
  const settingsPayload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  }
  // Keep business_name in sync with organizations.name so all app surfaces show the same value
  if (body.name !== undefined && body.name.trim() !== '') settingsPayload.business_name = body.name.trim()
  if (body.business_name !== undefined) settingsPayload.business_name = body.business_name
  if (body.business_phone !== undefined) settingsPayload.business_phone = body.business_phone
  if (body.business_address !== undefined) settingsPayload.business_address = body.business_address
  if (body.zip_code !== undefined) settingsPayload.zip_code = body.zip_code
  if (body.timezone !== undefined) settingsPayload.timezone = body.timezone
  if (body.dealer_cell_number !== undefined) settingsPayload.dealer_cell_number = body.dealer_cell_number
  if (body.voice_business_hours_start !== undefined) settingsPayload.voice_business_hours_start = body.voice_business_hours_start
  if (body.voice_business_hours_end !== undefined) settingsPayload.voice_business_hours_end = body.voice_business_hours_end
  if (body.gbp_location_id !== undefined) settingsPayload.gbp_location_id = body.gbp_location_id
  // JSONB org_settings.locations is read-only during multi-location rollout (Phase 8+).
  if (body.dealer_website_url !== undefined) {
    settingsPayload.dealer_website_url = body.dealer_website_url
    // Single inventory URL: when only URL is sent (e.g. from one-field form), clear path so sync uses URL as full page
    if (body.dealer_website_inventory_path === undefined) settingsPayload.dealer_website_inventory_path = ''
  }
  if (body.dealer_website_inventory_path !== undefined) settingsPayload.dealer_website_inventory_path = body.dealer_website_inventory_path
  if (body.postgrid_api_key !== undefined) (settingsPayload as Record<string, unknown>).postgrid_api_key = body.postgrid_api_key
  if (body.stripe_dealer_publishable_key !== undefined) (settingsPayload as Record<string, unknown>).stripe_dealer_publishable_key = body.stripe_dealer_publishable_key
  if (body.stripe_dealer_secret_key !== undefined) (settingsPayload as Record<string, unknown>).stripe_dealer_secret_key = body.stripe_dealer_secret_key
  if (body.booking_enabled !== undefined) (settingsPayload as Record<string, unknown>).booking_enabled = body.booking_enabled
  if (body.booking_intro_text !== undefined) (settingsPayload as Record<string, unknown>).booking_intro_text = body.booking_intro_text
  if (body.google_review_url !== undefined) (settingsPayload as Record<string, unknown>).google_review_url = body.google_review_url
  if (body.review_request_enabled !== undefined) (settingsPayload as Record<string, unknown>).review_request_enabled = body.review_request_enabled
  if (body.review_request_delay_days !== undefined) (settingsPayload as Record<string, unknown>).review_request_delay_days = body.review_request_delay_days
  if (body.lead_assignment_mode !== undefined) (settingsPayload as Record<string, unknown>).lead_assignment_mode = body.lead_assignment_mode
  if (body.lead_assignment_rep_index !== undefined) (settingsPayload as Record<string, unknown>).lead_assignment_rep_index = body.lead_assignment_rep_index
  if (body.lead_source_email_matchers !== undefined) {
    ;(settingsPayload as Record<string, unknown>).lead_source_email_matchers = sanitizeLeadSourceEmailMatchers(body.lead_source_email_matchers)
  }

  const hasSettingsUpdate = Object.keys(settingsPayload).length > 1 // more than just updated_at
  if (hasSettingsUpdate) {
    // Upsert: INSERT the row if missing (backfill trigger didn't run), UPDATE if present.
    // org_id is PRIMARY KEY so onConflict is valid. Service client bypasses RLS.
    const upsertData = { org_id: profile.org_id, ...settingsPayload }
    const { error: settingsErr } = await supabase
      .from('org_settings')
      .upsert(upsertData, { onConflict: 'org_id' })

    if (settingsErr) {
      console.error('[settings/org PATCH] upsert error:', settingsErr.message, 'org_id:', profile.org_id)
      return NextResponse.json({ error: 'Settings could not be saved' }, { status: 500 })
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
    .select('business_name, business_phone, business_address, zip_code, timezone, dealer_cell_number, voice_business_hours_start, voice_business_hours_end, twilio_phone_number, retell_agent_id, gbp_location_id, locations, resend_from_domain, dealer_website_url, dealer_website_inventory_path, lead_source_email_matchers')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const { data: calendarToken } = await supabase
    .from('org_google_tokens')
    .select('id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const auditChangedKeys: string[] = []
  if (body.name !== undefined) auditChangedKeys.push('name')
  if (hasSettingsUpdate) {
    for (const key of Object.keys(settingsPayload)) {
      if (key !== 'org_id' && key !== 'updated_at') auditChangedKeys.push(key)
    }
  }
  if (auditChangedKeys.length > 0) {
    void writeAuditLog({
      orgId:     profile.org_id,
      actorId:   profile.id,
      actorType: 'user',
      action:    'settings_updated',
      metadata:  { changed_keys: auditChangedKeys },
    })
  }

  void logOrgAudit({
    org_id: profile.org_id, actor_id: profile.id, actor_type: 'user',
    action: 'org_settings_updated', details: { fields: Object.keys(settingsPayload) },
  })

  return NextResponse.json({
    name: org?.name ?? '',
    plan: org?.plan ?? 'trial',
    subscription_status: org?.subscription_status ?? 'trialing',
    business_name: settings?.business_name ?? null,
    business_phone: settings?.business_phone ?? null,
    business_address: settings?.business_address ?? null,
    zip_code: settings?.zip_code ?? null,
    timezone: settings?.timezone ?? 'America/Los_Angeles',
    dealer_cell_number: settings?.dealer_cell_number ?? null,
    voice_business_hours_start: settings?.voice_business_hours_start ?? '09:00',
    voice_business_hours_end: settings?.voice_business_hours_end ?? '19:00',
    twilio_phone_number: settings?.twilio_phone_number ?? null,
    retell_agent_id: settings?.retell_agent_id ?? null,
    gbp_location_id: settings?.gbp_location_id ?? null,
    locations: settings?.locations ?? [],
    resend_from_domain: settings?.resend_from_domain ?? null,
    dealer_website_url: settings?.dealer_website_url ?? null,
    dealer_website_inventory_path: settings?.dealer_website_inventory_path ?? '/cars-for-sale',
    calendar_connected: !!calendarToken,
    lead_source_email_matchers: sanitizeLeadSourceEmailMatchers(settings?.lead_source_email_matchers),
  })
}
