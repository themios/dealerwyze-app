import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isOfferUpLead, parseOfferUpLead } from '@/lib/sms/parseOfferUpLead'
import { isAutoTraderLead, parseAutoTraderLead } from '@/lib/sms/parseAutoTraderLead'
import { isLabeledLeadPaste, parseLabeledLeadPaste } from '@/lib/leads/parseLabeledPaste'
import { parseCarGurusDigest } from '@/lib/leads/parser'
import { scanLeadText, scanResultToParsedLead } from '@/lib/leads/visionIngest'

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

  // CarGurus daily digest — multiple leads in one email/paste
  const digestLeads = parseCarGurusDigest('', text)
  if (digestLeads.length > 0) {
    const results: Array<{ isNew: boolean; customerId: string; name: string; phone: string | null; email: string | null; note: string | null; vehicle: string | null; source: string }> = []
    for (const lead of digestLeads) {
      if (!lead.phone && !lead.email) continue
      const digits = (lead.phone ?? '').replace(/\D/g, '')
      const phone10 = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10)
      const phoneDisplay = phone10.length === 10 ? `(${phone10.slice(0, 3)}) ${phone10.slice(3, 6)}-${phone10.slice(6)}` : (lead.phone || '')
      const notes = [
        lead.comments ? `Buyer: "${lead.comments}"` : null,
        lead.vin ? `VIN: ${lead.vin}` : null,
        lead.listed_price ? `Listed price: $${lead.listed_price.toLocaleString()}` : null,
      ].filter(Boolean).join('\n') || 'cargurus_digest lead'

      const existing = phoneDisplay
        ? await supabase.from('customers').select('id, name').eq('user_id', profile.org_id).eq('primary_phone', phoneDisplay).maybeSingle().then(r => r.data)
        : null
      const existingByEmail = !existing && lead.email
        ? await supabase.from('customers').select('id, name').eq('user_id', profile.org_id).eq('email', lead.email).maybeSingle().then(r => r.data)
        : null
      const match = existing ?? existingByEmail

      let customerId: string
      let isNew = false
      if (match) {
        customerId = match.id
      } else {
        const { data: newCust, error } = await supabase
          .from('customers')
          .insert({
            user_id: profile.org_id,
            name: lead.name,
            primary_phone: phoneDisplay || lead.name,
            email: lead.email || null,
            zip_code: lead.zip || null,
            lead_source: 'cargurus_digest',
            interested_in: lead.vehicle || null,
            notes,
          })
          .select('id')
          .single()
        if (error || !newCust) continue
        customerId = newCust.id
        isNew = true
      }

      const activityBody = [
        'CarGurus digest lead pasted from dashboard.',
        lead.vehicle ? `Vehicle: ${lead.vehicle}` : null,
        lead.vin ? `VIN: ${lead.vin}` : null,
      ].filter(Boolean).join('\n')
      const bodyWithAuthor = `name: ${profile.display_name}\n${activityBody}`
      await supabase.from('activities').insert({
        user_id: profile.org_id,
        customer_id: customerId,
        type: 'note',
        direction: 'inbound',
        outcome: 'answered',
        priority: 'high',
        body: bodyWithAuthor,
        completed_at: new Date().toISOString(),
      })

      results.push({
        isNew,
        customerId,
        name: lead.name,
        phone: phoneDisplay || null,
        email: lead.email || null,
        note: lead.comments || null,
        vehicle: lead.vehicle || null,
        source: 'cargurus_digest',
      })
    }
    if (results.length === 0) {
      return NextResponse.json(
        { error: 'No valid leads in digest (each lead needs phone or email).' },
        { status: 422 }
      )
    }
    return NextResponse.json({ multiple: true, results })
  }

  // Detect source + parse (single lead)
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
  } else if (isLabeledLeadPaste(text)) {
    const labeled = parseLabeledLeadPaste(text)
    if (labeled && (labeled.name || labeled.email)) {
      const phone10 = labeled.phone?.replace(/\D/g, '')
      const phoneNorm = phone10?.length === 10 ? phone10 : null
      parsed = {
        name:    labeled.name,
        phone:   phoneNorm,
        email:   labeled.email ?? null,
        note:    labeled.note ?? null,
        vehicle: labeled.vehicle ?? null,
        vin:     null,
        zip:     null,
        finance: null,
      }
      source = labeled.source
    }
  }

  // AI fallback: CarGurus, other formats, or any pasted lead text
  if (!parsed) {
    try {
      const scan = await scanLeadText(text)
      const pl = scanResultToParsedLead(scan)
      const digits = (pl.phone ?? '').replace(/\D/g, '')
      const phone10 = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10)
      parsed = {
        name:    pl.name,
        phone:   phone10.length === 10 ? phone10 : pl.phone ?? null,
        email:   pl.email || null,
        note:    pl.comments || null,
        vehicle: pl.vehicle || null,
        vin:     pl.vin || null,
        zip:     pl.zip || null,
        finance: null,
      }
      const src = (pl.source ?? 'other').toLowerCase()
      if (src.includes('cargurus')) source = 'cargurus'
      else if (src.includes('autotrader')) source = 'autotrader'
      else if (src.includes('offerup')) source = 'offerup'
      else if (src.includes('facebook')) source = 'facebook'
      else if (src.includes('kbb')) source = 'kbb'
      else if (src.includes('autolist')) source = 'autolist'
      else if (src.includes('carsforsale')) source = 'carsforsale'
      else source = 'other'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { error: 'AI parsing is not configured. Supported formats: OfferUp, AutoTrader. Other formats require AI (ANTHROPIC_API_KEY).' },
          { status: 503 }
        )
      }
      return NextResponse.json(
        { error: 'Could not parse lead. Try OfferUp or AutoTrader format, or check that the pasted text contains a name and contact (phone or email).' },
        { status: 422 }
      )
    }
  }

  if (!parsed?.name?.trim()) {
    return NextResponse.json(
      { error: 'Could not parse lead. The pasted text should include a name (and phone or email).' },
      { status: 422 }
    )
  }
  if (!parsed.phone && !parsed.email) {
    return NextResponse.json(
      { error: 'Could not parse lead. Phone or email is required to create a contact.' },
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

  // Activity note (prefixed with author name)
  const activityBody = [
    `${source} lead pasted from dashboard.`,
    parsed.vehicle ? `Vehicle: ${parsed.vehicle}` : null,
    parsed.note    ? `Buyer: "${parsed.note}"` : null,
    parsed.finance ? `Finance offer: ${parsed.finance}` : null,
    parsed.vin     ? `VIN: ${parsed.vin}` : null,
  ].filter(Boolean).join('\n')
  const bodyWithAuthor = `name: ${profile.display_name}\n${activityBody}`

  await supabase.from('activities').insert({
    user_id:      profile.org_id,
    customer_id:  customerId,
    type:         'note',
    direction:    'inbound',
    outcome:      'answered',
    priority:     'high',
    body:         bodyWithAuthor,
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
