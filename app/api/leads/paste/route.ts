import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { isOfferUpLead, parseOfferUpLead } from '@/lib/leads/parseOfferUpSms'
import { isAutoTraderLead, parseAutoTraderLead } from '@/lib/leads/parseAutoTraderSms'
import { isLabeledLeadPaste, parseLabeledLeadPaste } from '@/lib/leads/parseLabeledPaste'
import { parseCarGurusDigest } from '@/lib/leads/parser'
import { scanLeadText, scanResultToParsedLead } from '@/lib/leads/visionIngest'
import { normalizePhone } from '@/lib/utils/phone'
import { deriveLeadIntentFromLead, mergeLeadIntent } from '@/lib/leads/intent'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Look up a vehicle in this org's inventory. VIN match first; year/make/model fallback. */
async function findVehicleInInventory(
  supabase: SupabaseClient,
  vin: string | null | undefined,
  vehicleStr: string | null | undefined,
): Promise<{ id: string; year: number; make: string; model: string } | null> {
  if (vin?.trim()) {
    const { data } = await supabase
      .from('vehicles')
      .select('id, year, make, model')
      .eq('vin', vin.trim().toUpperCase())
      .neq('status', 'sold')
      .maybeSingle()
    if (data) return data
  }
  if (vehicleStr?.trim()) {
    const parts = vehicleStr.trim().split(/\s+/)
    const year = parseInt(parts[0], 10)
    const make = parts[1] ?? ''
    const model = parts[2] ?? ''
    if (!isNaN(year) && make && model) {
      const { data } = await supabase
        .from('vehicles')
        .select('id, year, make, model')
        .eq('year', year)
        .ilike('make', make)
        .ilike('model', `${model}%`)
        .neq('status', 'sold')
        .limit(1)
        .maybeSingle()
      if (data) return data
    }
  }
  return null
}

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
  const service  = createServiceClient()
  // customers table uses user_id for org scoping (no org_id column)
  // Covers: user_id=org_id (paste/ingest path) and user_id=auth-uid (pre-008 legacy)
  const orgFilter = `user_id.eq.${profile.org_id},user_id.eq.${profile.id}`

  const { text } = await req.json()
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  // CarGurus daily digest — multiple leads in one email/paste
  const digestLeads = parseCarGurusDigest('', text)
  if (digestLeads.length > 0) {
    const results: Array<{ isNew: boolean; customerId: string; name: string; phone: string | null; email: string | null; note: string | null; vehicle: string | null; vehicleId: string | null; vehicleName: string | null; source: string }> = []
    for (const lead of digestLeads) {
      const digits = (lead.phone ?? '').replace(/\D/g, '')
      const phone10 = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10)
      const phoneDisplay = phone10.length === 10 ? `(${phone10.slice(0, 3)}) ${phone10.slice(3, 6)}-${phone10.slice(6)}` : (lead.phone || '')
      const notes = [
        lead.comments ? `Buyer: "${lead.comments}"` : null,
        lead.vin ? `VIN: ${lead.vin}` : null,
        lead.listed_price ? `Listed price: $${lead.listed_price.toLocaleString()}` : null,
      ].filter(Boolean).join('\n') || 'cargurus_digest lead'

      // Match existing customer by email first, then by normalized phone — always target the OLDEST record (most history)
      let match: { id: string } | null = null
      if (lead.email) {
        const { data: byEmail } = await service
          .from('customers')
          .select('id')
          .or(orgFilter)
          .eq('email', lead.email)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        match = byEmail ?? null
      }
      if (!match && phoneDisplay) {
        const norm = normalizePhone(lead.phone ?? phoneDisplay)
        if (norm.length >= 10) {
          const { data: phoneRows } = await service
            .from('customers')
            .select('id, primary_phone, secondary_phone, created_at')
            .or(orgFilter)
            .order('created_at', { ascending: true })
            .limit(500)
          const byPhone = phoneRows?.find(
            (c) =>
              normalizePhone(c.primary_phone ?? '') === norm ||
              normalizePhone(c.secondary_phone ?? '') === norm
          ) ?? null
          match = byPhone ? { id: byPhone.id } : null
        }
      }
      if (!match && !lead.email && !lead.phone) {
        const normalizedLeadName = normalizeName(lead.name)
        const { data: nameCandidates } = await service
          .from('customers')
          .select('id, name, interested_in, lead_source')
          .or(orgFilter)
          .order('created_at', { ascending: true })
          .limit(200)
        const matchedByName = (nameCandidates ?? []).filter(candidate => {
          if (normalizeName(candidate.name ?? '') !== normalizedLeadName) return false
          if (lead.vehicle && candidate.interested_in) {
            return candidate.interested_in.toLowerCase().includes(lead.vehicle.toLowerCase())
          }
          return candidate.lead_source === 'cargurus' || candidate.lead_source === 'cargurus_digest'
        })
        if (matchedByName.length === 1) {
          match = { id: matchedByName[0].id }
        }
      }
      if (!match && !lead.phone && !lead.email) continue

      let customerId: string
      let isNew = false
      let existingIntent: {
        lead_intent_tier?: string | null
        lead_intent_score?: number | null
        lead_intent_flags?: string[] | null
        lead_intent_summary?: string | null
        lead_intent_source?: string | null
        lead_intent_manual_note?: string | null
      } | null = null
      if (match) {
        customerId = match.id
        // Merge: backfill only empty fields so we never overwrite existing data or lose history
        const { data: existing } = await supabase
          .from('customers')
          .select('email, zip_code, name, notes, interested_in, lead_source, lead_intent_tier, lead_intent_score, lead_intent_flags, lead_intent_summary, lead_intent_source, lead_intent_manual_note')
          .eq('id', customerId)
          .single()
        existingIntent = existing
        const updates: Record<string, string | null> = {}
        if (lead.email && !existing?.email?.trim()) updates.email = lead.email
        if (lead.zip && !existing?.zip_code?.trim()) updates.zip_code = lead.zip
        if (lead.name?.trim() && !existing?.name?.trim()) updates.name = lead.name
        if (notes && !existing?.notes?.trim()) updates.notes = notes
        if (lead.vehicle && !existing?.interested_in?.trim()) updates.interested_in = lead.vehicle
        if (!existing?.lead_source?.trim()) updates.lead_source = 'cargurus_digest'
        if (Object.keys(updates).length > 0) {
          await supabase.from('customers').update(updates).eq('id', customerId)
        }
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

      const intent = deriveLeadIntentFromLead(lead, !isNew)
      if (intent) {
        const mergedIntent = mergeLeadIntent({
          tier: existingIntent?.lead_intent_tier,
          score: existingIntent?.lead_intent_score,
          flags: existingIntent?.lead_intent_flags,
          summary: existingIntent?.lead_intent_summary,
          source: existingIntent?.lead_intent_source,
          manualNote: existingIntent?.lead_intent_manual_note,
        }, intent)
        const intentPatch: Record<string, unknown> = {
          lead_intent_score: mergedIntent.score,
          lead_intent_tier: mergedIntent.tier,
          lead_intent_flags: mergedIntent.flags,
          lead_intent_summary: mergedIntent.summary,
          lead_intent_source: mergedIntent.source,
          lead_intent_updated_at: mergedIntent.updatedAt,
        }
        if (mergedIntent.tier === 'hot') intentPatch.lead_rating = 'hot'
        await supabase.from('customers').update(intentPatch).eq('id', customerId)
      }

      void applyLeadLocationDetection({
        customerId,
        orgId: profile.org_id,
        context: {
          emailBody: [text, lead.comments, notes].filter(Boolean).join('\n'),
        },
        customerPhone: phoneDisplay || lead.phone,
        supabase: service,
      })

      // Auto-link vehicle from inventory (VIN first, then year/make/model)
      let vehicleId: string | null = null
      let vehicleName: string | null = null
      const foundVehicle = await findVehicleInInventory(supabase, lead.vin, lead.vehicle)
      if (foundVehicle) {
        vehicleId = foundVehicle.id
        vehicleName = `${foundVehicle.year} ${foundVehicle.make} ${foundVehicle.model}`
        await supabase.from('customer_vehicles').upsert(
          { customer_id: customerId, vehicle_id: vehicleId, interest_level: 'warm' },
          { onConflict: 'customer_id,vehicle_id' },
        )
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
        vehicleId,
        vehicleName,
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

  // Plain-text fallback: "First Last\n10-digit-phone" (manual entry, no AI needed)
  if (!parsed) {
    const lines = text.trim().split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
    const phoneRe = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    const phoneLine = lines.find((l: string) => phoneRe.test(l) && !emailRe.test(l))
    const nameLine  = lines.find((l: string) => !phoneRe.test(l) && !emailRe.test(l) && l.length > 1)
    const emailLine = lines.find((l: string) => emailRe.test(l))
    if (phoneLine || emailLine) {
      const rawPhone = phoneLine?.match(phoneRe)?.[0] ?? null
      const digits   = rawPhone ? rawPhone.replace(/\D/g, '') : ''
      const phone10  = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10)
      parsed = {
        name:    nameLine ?? emailLine?.split('@')[0] ?? 'Unknown',
        phone:   phone10.length === 10 ? phone10 : null,
        email:   emailLine ?? null,
        note:    null,
        vehicle: null,
        vin:     null,
        zip:     null,
        finance: null,
      }
      source = 'other'
    }
  }

  // AI fallback: CarGurus, other formats, or any pasted lead text
  if (!parsed) {
    try {
      const scans = await scanLeadText(text)
      const scan = scans[0]
      if (!scan) throw new Error('AI returned no leads')
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
      if (msg.includes('OPENROUTER_API_KEY') || msg.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { error: 'AI parsing is not configured. Supported formats: OfferUp, AutoTrader. Other formats require AI (OPENROUTER_API_KEY).' },
          { status: 503 }
        )
      }
      return NextResponse.json(
        { error: 'Could not parse lead. Try OfferUp or AutoTrader format, or check that the pasted text contains a name and contact (phone or email).' },
        { status: 422 }
      )
    }
  }

  if (!parsed?.phone && !parsed?.email) {
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

  // Match existing customer by email first, then by normalized phone — always target the OLDEST record (most history)
  let match: { id: string } | null = null
  if (parsed.email) {
    const { data: byEmail } = await service
      .from('customers')
      .select('id')
      .or(orgFilter)
      .eq('email', parsed.email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    match = byEmail ?? null
  }
  if (!match && phoneDisplay) {
    const norm = normalizePhone(parsed.phone ?? phoneDisplay)
    if (norm.length >= 10) {
      const { data: phoneRows } = await service
        .from('customers')
        .select('id, primary_phone, secondary_phone, created_at')
        .or(orgFilter)
        .order('created_at', { ascending: true })
        .limit(500)
      const byPhone = phoneRows?.find(
        (c) =>
          normalizePhone(c.primary_phone ?? '') === norm ||
          normalizePhone(c.secondary_phone ?? '') === norm
      ) ?? null
      match = byPhone ? { id: byPhone.id } : null
    }
  }

  let customerId: string
  let isNew = false

  if (match) {
    customerId = match.id
    // Merge: backfill only empty fields so we never overwrite existing data or lose history
    const { data: existing } = await supabase
      .from('customers')
      .select('email, zip_code, name, notes, interested_in, lead_source')
      .eq('id', customerId)
      .single()
    const updates: Record<string, string | null> = {}
    if (parsed.email && !existing?.email?.trim()) updates.email = parsed.email
    if (parsed.zip && !existing?.zip_code?.trim()) updates.zip_code = parsed.zip
    if (parsed.name?.trim() && !existing?.name?.trim()) updates.name = parsed.name
    if (notes && !existing?.notes?.trim()) updates.notes = notes
    if (parsed.vehicle && !existing?.interested_in?.trim()) updates.interested_in = parsed.vehicle
    if (!existing?.lead_source?.trim()) updates.lead_source = source
    if (Object.keys(updates).length > 0) {
      await supabase.from('customers').update(updates).eq('id', customerId)
    }
  } else {
    const { data: newCust, error } = await supabase
      .from('customers')
      .insert({
        user_id:       profile.org_id,
        name:          parsed.name?.trim() || 'Unknown',
        primary_phone: phoneDisplay || null,
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

  void applyLeadLocationDetection({
    customerId,
    orgId: profile.org_id,
    context: { emailBody: text },
    customerPhone: phoneDisplay || parsed.phone,
    supabase: service,
  })

  // Auto-link vehicle from inventory (VIN first, then year/make/model)
  let vehicleId: string | null = null
  let vehicleName: string | null = null
  const foundVehicle = await findVehicleInInventory(supabase, parsed.vin, parsed.vehicle)
  if (foundVehicle) {
    vehicleId = foundVehicle.id
    vehicleName = `${foundVehicle.year} ${foundVehicle.make} ${foundVehicle.model}`
    await supabase.from('customer_vehicles').upsert(
      { customer_id: customerId, vehicle_id: vehicleId, interest_level: 'warm' },
      { onConflict: 'customer_id,vehicle_id' },
    )
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
    name:        parsed.name,
    phone:       phoneDisplay || null,
    email:       parsed.email,
    note:        parsed.note,
    vehicle:     parsed.vehicle,
    vehicleId,
    vehicleName,
    source,
  })
}
