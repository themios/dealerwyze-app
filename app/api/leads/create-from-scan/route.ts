import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { incrementScanCount } from '@/lib/leads/scanQuota'
import { ingestLead } from '@/lib/leads/ingest'
import type { LeadScanResult } from '@/lib/leads/visionIngest'
import { scanResultToParsedLead } from '@/lib/leads/visionIngest'

export interface CreateFromScanBody {
  scan:           LeadScanResult
  isPdf:          boolean
  send_intro_sms: boolean
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
  const profile = await requireProfile()
  const orgId   = profile.org_id

  const body: CreateFromScanBody = await req.json()
  const { scan, isPdf, send_intro_sms, overrides = {} } = body

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

  const parsedLead = scanResultToParsedLead(merged)
  const externalId = `scan-${orgId}-${Date.now()}`

  const result = await ingestLead(parsedLead, externalId, orgId)
  if ('error' in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const customerId = result.customer_id ?? null

  // Async: increment quota counter + write scan log (no latency impact)
  after(async () => {
    await incrementScanCount(orgId, isPdf, customerId ?? null, scan.overall_confidence)
  })

  // Optional intro SMS — use existing /api/sms/send logic via direct Twilio call
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

      // Fetch org settings for dealer name
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('dealer_name, twilio_phone_number, tcpa_opt_out_msg')
        .eq('org_id', orgId)
        .maybeSingle()

      const dealerName  = orgSettings?.dealer_name ?? 'your dealer'
      const fromNumber  = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER
      const accountSid  = process.env.TWILIO_ACCOUNT_SID
      const authToken   = process.env.TWILIO_AUTH_TOKEN
      const msgSvcSid   = process.env.TWILIO_MESSAGING_SERVICE_SID

      const body = `Hi ${firstName}! Thanks for your interest. This is ${dealerName} — we'd love to help you find the right vehicle. Reply STOP to opt out.`

      if (accountSid && authToken && (fromNumber || msgSvcSid)) {
        const params: Record<string, string> = { To: phone, Body: body }
        if (msgSvcSid) params.MessagingServiceSid = msgSvcSid
        else params.From = fromNumber!

        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams(params),
            }
          )

          // Log the intro SMS as an outbound activity
          await supabase.from('activities').insert({
            user_id:      orgId,
            customer_id:  customerId,
            type:         'sms',
            direction:    'outbound',
            outcome:      null,
            body,
          })
        } catch {
          // Non-fatal — lead already created
        }
      }
    }
  }

  return NextResponse.json({
    status: result.status ?? 'created',
    customer_id: customerId,
  })
}
