import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isOfferUpLead, parseOfferUpLead } from '@/lib/sms/parseOfferUpLead'
import { isAutoTraderLead, parseAutoTraderLead } from '@/lib/sms/parseAutoTraderLead'

interface ParsedLead {
  name:     string
  phone:    string | null
  email:    string | null
  note:     string | null
  vehicle:  string | null
  vin?:     string | null
  zip?:     string | null
  finance?: string | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { text } = await req.json()
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  // Detect source + parse
  let parsed: ParsedLead | null = null
  let source = 'unknown'

  if (isAutoTraderLead(text)) {
    const at = parseAutoTraderLead(text)
    if (at) {
      parsed = at
      source = 'autotrader'
    }
  } else if (isOfferUpLead(text)) {
    const ou = parseOfferUpLead(text)
    if (ou) {
      parsed = ou
      source = 'offerup'
    }
  }

  if (!parsed) {
    return NextResponse.json(
      { error: 'Could not detect lead format. Supported: OfferUp, AutoTrader.' },
      { status: 422 }
    )
  }

  // Format phone for display
  const digits = parsed.phone ?? ''
  const phoneDisplay = digits.length === 10
    ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
    : parsed.phone ?? ''

  // Build notes string
  const notesParts = [
    parsed.note    ? `Buyer: "${parsed.note}"` : null,
    parsed.vin     ? `VIN: ${parsed.vin}` : null,
    parsed.finance ? `Finance: ${parsed.finance}` : null,
  ].filter(Boolean)
  const notes = notesParts.length > 0 ? notesParts.join('\n') : `${source} lead`

  // Check for existing customer by phone (skip if no phone)
  let customerId: string
  let isNew = false

  const existing = phoneDisplay
    ? await supabase
        .from('customers')
        .select('id, name')
        .eq('user_id', profile.org_id)
        .eq('primary_phone', phoneDisplay)
        .maybeSingle()
        .then(r => r.data)
    : null

  // Also try match by email if no phone match
  const existingByEmail = !existing && parsed.email
    ? await supabase
        .from('customers')
        .select('id, name')
        .eq('user_id', profile.org_id)
        .eq('email', parsed.email)
        .maybeSingle()
        .then(r => r.data)
    : null

  const match = existing ?? existingByEmail

  if (match) {
    customerId = match.id
  } else {
    const { data: newCust, error } = await supabase
      .from('customers')
      .insert({
        user_id:       profile.org_id,
        name:          parsed.name,
        primary_phone: phoneDisplay || parsed.name,
        email:         parsed.email ?? null,
        zip_code:      parsed.zip   ?? null,
        lead_source:   source,
        interested_in: parsed.vehicle ?? null,
        notes,
      })
      .select('id')
      .single()

    if (error || !newCust) {
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
    }
    customerId = newCust.id
    isNew = true
  }

  // Activity note
  const activityBody = [
    `${source} lead pasted from dashboard.`,
    parsed.vehicle ? `Vehicle: ${parsed.vehicle}` : null,
    parsed.note    ? `Buyer: "${parsed.note}"` : null,
    parsed.finance ? `Finance offer: ${parsed.finance}` : null,
    parsed.vin     ? `VIN: ${parsed.vin}` : null,
  ].filter(Boolean).join('\n')

  await supabase.from('activities').insert({
    user_id:      profile.org_id,
    customer_id:  customerId,
    type:         'note',
    direction:    'inbound',
    outcome:      'answered',
    priority:     'high',
    body:         activityBody,
    completed_at: new Date().toISOString(),
  })

  return NextResponse.json({
    isNew,
    customerId,
    name:    parsed.name,
    phone:   phoneDisplay || null,
    email:   parsed.email,
    note:    parsed.note,
    vehicle: parsed.vehicle,
    source,
  })
}
