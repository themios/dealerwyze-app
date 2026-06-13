import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { incrementScanCount } from '@/lib/leads/scanQuota'
import { ingestLead } from '@/lib/leads/ingest'
import type { LeadScanResult } from '@/lib/leads/visionIngestTypes'
import { sendOutboundSms, SmsSendError } from '@/lib/sms/sendOutbound'
import { normalizePhone } from '@/lib/utils/phone'
import { createServiceClient } from '@/lib/supabase/service'
import { getLeadOutboundIdentity } from '@/lib/locations/getLeadTemplateVars'

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

    // Apply user edits on top of scan values.
    // Scan fields can be null at runtime when the AI found no value — guard every spread.
    type SF<T> = import('@/lib/leads/visionIngestTypes').ScanField<T>
    function mf<T>(field: SF<T> | null, override: T | undefined): SF<T> {
      const base: SF<T> = field ?? { value: null, confidence: 'low' }
      return override !== undefined ? { ...base, value: override } : base
    }
    const merged: LeadScanResult = {
      ...scan,
      first_name:    mf(scan.first_name,    overrides.first_name),
      last_name:     mf(scan.last_name,     overrides.last_name),
      phone:         mf(scan.phone,         overrides.phone),
      phone2:        mf(scan.phone2,        overrides.phone2),
      email:         mf(scan.email,         overrides.email),
      zip:           mf(scan.zip,           overrides.zip),
      vehicle_year:  mf(scan.vehicle_year,  overrides.vehicle_year ?? undefined) as SF<number>,
      vehicle_make:  mf(scan.vehicle_make,  overrides.vehicle_make),
      vehicle_model: mf(scan.vehicle_model, overrides.vehicle_model),
      vehicle_trim:  mf(scan.vehicle_trim,  overrides.vehicle_trim),
      vehicle_vin:   mf(scan.vehicle_vin,   overrides.vehicle_vin),
      notes:         mf(scan.notes,         overrides.notes),
    }

    const { scanResultToParsedLead } = await import('@/lib/leads/visionIngest')
    const parsedLead = scanResultToParsedLead(merged)
    if (!parsedLead.email && !normalizePhone(parsedLead.phone)) {
      return NextResponse.json(
        { error: 'Lead needs a valid phone number or email before it can be saved.' },
        { status: 422 },
      )
    }
    const externalId = `scan-${orgId}-${Date.now()}`

    let result: Awaited<ReturnType<typeof ingestLead>>
    try {
      result = await ingestLead(parsedLead, externalId, orgId, { capturedByUserId: profile.id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lead ingest failed'
      console.error('[leads/create-from-scan] ingestLead threw:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const customerId =
      (result as { customer_id?: string | null }).customer_id ??
      null
    if (!customerId) {
      const reason = (result as { reason?: string }).reason ?? 'unknown'
      return NextResponse.json(
        { error: `Lead was scanned but could not be saved (${reason}). Please add a phone number or email and try again.` },
        { status: 422 },
      )
    }

    const ingestStatus =
      (result as { status?: string }).status === 'duplicate' ? 'duplicate' : 'created'

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
        const identity = await getLeadOutboundIdentity(orgId, customerId, createServiceClient())
        const dealerName = identity.name?.trim() || 'your dealer'
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
      status: ingestStatus,
      customer_id: customerId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[leads/create-from-scan] unhandled:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
