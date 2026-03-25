import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedLead } from '@/lib/leads/parser'
import { sendLeadNotification } from '@/lib/push/send'
import { createLeadResponseTask } from '@/lib/tasks/auto'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

function parseVehicleName(name: string) {
  const parts = name.trim().split(/\s+/)
  const year = parseInt(parts[0], 10)
  const make = parts[1] || 'Unknown'
  const model = parts[2] || 'Unknown'
  const trim = parts.slice(3).join(' ') || null
  return { year: isNaN(year) ? 0 : year, make, model, trim }
}

export async function ingestLead(lead: ParsedLead, external_id: string, orgId?: string) {
  const supabase = createServiceClient()
  const userId = orgId!

  // 1. Upsert customer — match by email first, then normalized phone
  function normalizePhone(p: string): string {
    const d = p.replace(/\D/g, '')
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  }

  // Dedup check FIRST — before creating any customer record
  // Prevents orphaned customers when email/phone are blank (e.g. Facebook leads)
  const { data: earlyDup } = await supabase
    .from('activities')
    .select('id')
    .eq('external_id', external_id)
    .maybeSingle()
  if (earlyDup) return { status: 'duplicate', activity_id: earlyDup.id }

  // Skip any lead with no contact info — can't reach them regardless of source
  if (!lead.email && !lead.phone) return { status: 'skipped', reason: 'no_contact_info' }

  let customerId: string

  // Try email match — must be scoped to this org (critical for SAAS_MODE)
  const { data: existingByEmail } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .eq('email', lead.email)
    .maybeSingle()

  let isReInquiry = false

  if (existingByEmail) {
    customerId = existingByEmail.id
    isReInquiry = true
    // Backfill email if the record came in via voice (may have been blank)
    await supabase.from('customers').update({ email: lead.email }).eq('id', customerId).is('email', null)
  } else {
    // Try phone match (catches customers created by voice ingest)
    let existingByPhone = null
    if (lead.phone) {
      const normPhone = normalizePhone(lead.phone)
      const { data: phoneRows } = await supabase
        .from('customers')
        .select('id, primary_phone, secondary_phone')
        .eq('user_id', userId)

      existingByPhone = phoneRows?.find(c => {
        const p = normalizePhone(c.primary_phone || '')
        const s = normalizePhone(c.secondary_phone || '')
        return p === normPhone || s === normPhone
      }) ?? null
    }

    if (existingByPhone) {
      customerId = existingByPhone.id
      isReInquiry = true
      // Backfill email on the matched record
      await supabase.from('customers').update({ email: lead.email }).eq('id', customerId).is('email', null)
    } else {
      const { data: created, error } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          name: lead.name,
          primary_phone: lead.phone,
          email: lead.email,
          lead_source: lead.source,
          zip_code: lead.zip,
        })
        .select('id')
        .single()

      if (error || !created) {
        return { error: error?.message || 'Failed to create customer' }
      }
      customerId = created.id

      // Set initial lead state for brand-new customers (no-op if already set)
      await supabase.rpc('advance_lead_state', {
        p_customer_id: customerId,
        p_new_state:   'new_lead',
        p_reason:      `New lead from ${lead.source}`,
      })
    }
  }

  // Mark as hot if source declared it or customer is re-inquiring
  const shouldMarkHot = lead.is_hot || lead.is_reengaged || isReInquiry
  if (shouldMarkHot) {
    await supabase.from('customers').update({ lead_rating: 'hot' }).eq('id', customerId)
  }

  // 2. Dedup: customer already has a recent inbound high-priority lead within 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const { data: recentLead } = await supabase
    .from('activities')
    .select('id')
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .eq('priority', 'high')
    .gte('created_at', sevenDaysAgo.toISOString())
    .maybeSingle()

  if (recentLead) return { status: 'duplicate', activity_id: recentLead.id }

  // 4. Find or create vehicle
  let vehicleId: string | null = null
  if (lead.vehicle) {
    const { year, make, model, trim } = parseVehicleName(lead.vehicle)

    let existingVehicle = null
    const normVin = (v: string) => v.trim().toUpperCase().replace(/\s/g, '')

    if (lead.vin) {
      const cleanVin = normVin(lead.vin)
      // Match by VIN only — avoids assigning wrong vehicle when multiple of same model exist
      const { data: vinCandidates } = await supabase
        .from('vehicles').select('id, vin').not('vin', 'is', null)
      existingVehicle = vinCandidates?.find(v => normVin(v.vin ?? '') === cleanVin) ?? null
    }

    // Backfill VIN onto inventory vehicle if we matched by model but lead has a VIN
    if (existingVehicle && lead.vin && !(existingVehicle as { vin?: string }).vin) {
      await supabase.from('vehicles')
        .update({ vin: normVin(lead.vin) })
        .eq('id', existingVehicle.id)
    }

    if (existingVehicle) {
      vehicleId = existingVehicle.id
    } else {
      const stockNo = lead.vin ? `CG-${lead.vin.slice(-6)}` : `CG-${Date.now().toString().slice(-6)}`
      const { data: newVehicle, error: vErr } = await supabase
        .from('vehicles')
        .insert({
          user_id: userId,
          stock_no: stockNo,
          vin: lead.vin || null,
          year, make, model,
          trim: trim || null,
          price: lead.listed_price || null,
          status: 'available',
          notes: `Imported from CarGurus lead — ${new Date().toLocaleDateString()}`,
        })
        .select('id')
        .single()
      if (!vErr && newVehicle) vehicleId = newVehicle.id
    }

    if (vehicleId) {
      const { data: existingLink } = await supabase.from('customer_vehicles').select('id').eq('customer_id', customerId).eq('vehicle_id', vehicleId).maybeSingle()
      if (!existingLink) {
        await supabase.from('customer_vehicles').insert({ customer_id: customerId, vehicle_id: vehicleId, interest_level: 'hot' })
      }
    }
  }

  // 5. Create inbound lead activity
  const activityBody = [
    `From: ${lead.name} <${lead.email}>`,
    `Phone: ${lead.phone}`,
    lead.zip ? `ZIP: ${lead.zip}` : '',
    `Vehicle: ${lead.vehicle}${lead.listed_price ? ` — $${lead.listed_price.toLocaleString()}` : ''}`,
    lead.vin ? `VIN: ${lead.vin}` : '',
    '',
    lead.comments ? `"${lead.comments}"` : '(No message)',
  ].filter(Boolean).join('\n')

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .insert({
      user_id: userId,
      customer_id: customerId,
      vehicle_id: vehicleId,
      type: 'email',
      direction: 'inbound',
      outcome: 'pending',
      priority: 'high',
      body: activityBody,
      external_id,
    })
    .select('id')
    .single()

  if (actErr || !activity) return { error: actErr?.message || 'Failed to create activity' }

  const hotLabel = shouldMarkHot ? (isReInquiry ? ' - Returning Customer' : ' - HOT') : ''

  sendLeadNotification({
    title: `${shouldMarkHot ? '🔥 ' : ''}New Lead: ${lead.name}${hotLabel}`,
    body: lead.vehicle || lead.source,
    url: `/customers/${customerId}`,
  }).catch(() => {})

  sendTelegramMessage(
    `${shouldMarkHot ? '🔥 ' : ''}<b>New Lead</b> (${lead.source})${hotLabel}\n` +
    `<b>${lead.name}</b>${lead.vehicle ? ` - ${lead.vehicle}` : ''}\n` +
    (lead.phone ? `Phone: ${lead.phone}\n` : '') +
    (lead.email ? `Email: ${lead.email}\n` : '') +
    `Reply via DealerWyze`
  ).catch(() => {})

  // Auto-create a lead_response task due in 10 minutes
  createLeadResponseTask(
    customerId,
    lead.name,
    lead.vehicle ?? null,
    vehicleId,
    userId
  ).catch(() => {})

  return { status: 'created', customer_id: customerId, vehicle_id: vehicleId, activity_id: activity.id }
}
