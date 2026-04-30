import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { incrementScanCount } from '@/lib/leads/scanQuota'
import { ingestLead } from '@/lib/leads/ingest'
import type { LeadScanResult } from '@/lib/leads/visionIngestTypes'
import { sendOutboundSms, SmsSendError } from '@/lib/sms/sendOutbound'

export interface CreateFromScanBody {
  scan:             LeadScanResult
  isPdf:            boolean
  send_intro_sms:   boolean
  link_vehicle_id?: string | null
  // User-edited overrides (merged on top of scan values before saving)
  overrides?: {
    first_name?:    string
    last_name?:     string
    phone?:         string
    phone2?:        string
    email?:         string
    zip?:           string
    vehicle_year?:  number | null
    vehicle_make?:  string
    vehicle_model?: string
    vehicle_trim?:  string
    vehicle_vin?:   string
    notes?:         string
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const orgId   = profile.org_id

    const body: CreateFromScanBody = await req.json()
    const { scan, isPdf, send_intro_sms, overrides = {}, link_vehicle_id } = body

    // Apply user edits on top of scan values
    const merged: LeadScanResult = {
      ...scan,
      first_name:    { ...scan.first_name,    value: overrides.first_name    ?? scan.first_name.value },
      last_name:     { ...scan.last_name,     value: overrides.last_name     ?? scan.last_name.value },
      phone:         { ...scan.phone,         value: overrides.phone         ?? scan.phone.value },
      phone2:        { ...scan.phone2,        value: overrides.phone2        ?? scan.phone2.value },
      email:         { ...scan.email,         value: overrides.email         ?? scan.email.value },
      zip:           { ...scan.zip,           value: overrides.zip           ?? scan.zip.value },
      vehicle_year:  { ...scan.vehicle_year,  value: overrides.vehicle_year  !== undefined ? overrides.vehicle_year : scan.vehicle_year.value },
      vehicle_make:  { ...scan.vehicle_make,  value: overrides.vehicle_make  ?? scan.vehicle_make.value },
      vehicle_model: { ...scan.vehicle_model, value: overrides.vehicle_model ?? scan.vehicle_model.value },
      vehicle_trim:  { ...scan.vehicle_trim,  value: overrides.vehicle_trim  ?? scan.vehicle_trim.value },
      vehicle_vin:   { ...scan.vehicle_vin,   value: overrides.vehicle_vin   ?? scan.vehicle_vin.value },
      notes:         { ...scan.notes,         value: overrides.notes         ?? scan.notes.value },
    }

    const { scanResultToParsedLead } = await import('@/lib/leads/visionIngest')
    const parsedLead = scanResultToParsedLead(merged)
    const externalId = `scan-${orgId}-${Date.now()}`

    let result: Awaited<ReturnType<typeof ingestLead>>
    try {
      result = await ingestLead(parsedLead, externalId, orgId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lead ingest failed'
      console.error('[leads/create-from-scan] ingestLead threw:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const customerId = (result as { customer_id?: string | null }).customer_id ?? null
    if (!customerId) {
      const reason = (result as { reason?: string }).reason ?? 'unknown'
      return NextResponse.json(
        { error: `Lead was scanned but could not be saved (${reason}). Please add a phone number or email and try again.` },
        { status: 422 },
      )
    }

  // Link vehicle from inventory if dealer selected one on the confirm screen
  if (customerId && link_vehicle_id) {
    const supabase = await createClient()
    const { data: existing } = await supabase
      .from('customer_vehicles')
      .select('id')
      .eq('customer_id', customerId)
      .eq('vehicle_id', link_vehicle_id)
      .maybeSingle()
    if (!existing) {
      await supabase.from('customer_vehicles').insert({
        customer_id:    customerId,
        vehicle_id:     link_vehicle_id,
        interest_level: 'hot',
      })
    }
  }

  // Async: increment quota counter + write scan log (no latency impact)
  after(async () => {
    await incrementScanCount(orgId, isPdf, customerId ?? null, scan.overall_confidence)
  })

  // Optional intro SMS — reuse the same quota / rate limit / opt-out enforcement as normal outbound SMS
  if (send_intro_sms && customerId) {
    const supabase = await createClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('primary_phone, name')
      .eq('id', customerId)
      .single()

    const phone = customer?.primary_phone
    if (phone) {
      const firstName = (merged.first_name.value ?? customer?.name?.split(' ')[0] ?? 'there')
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('dealer_name')
        .eq('org_id', orgId)
        .maybeSingle()

      const dealerName = orgSettings?.dealer_name ?? 'your dealer'
      const introBody = `Hi ${firstName}! Thanks for your interest. This is ${dealerName} — we'd love to help you find the right vehicle. Reply STOP to opt out.`

      try {
        await sendOutboundSms({
          orgId,
          to: phone,
          body: introBody,
          customerId,
          senderDisplayName: profile.display_name,
          markInboundAddressed: false,
        })
      } catch (err) {
        if (!(err instanceof SmsSendError)) {
          console.error('[leads/create-from-scan] intro SMS failed:', err)
        }
        // Non-fatal — lead already created
      }
    }
  }

    return NextResponse.json({
      status: (result as { status?: string }).status ?? 'created',
      customer_id: customerId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[leads/create-from-scan] unhandled:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
