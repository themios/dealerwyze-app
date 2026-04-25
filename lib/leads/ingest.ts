import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedLead } from '@/lib/leads/parser'
import { sendLeadNotification } from '@/lib/push/send'
import { createLeadResponseTask } from '@/lib/tasks/auto'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendSmsConsentRequest } from '@/lib/sms/sendConsent'
import { resolveLeadAssignee } from '@/lib/leads/assignLead'
import { sendAutoResponseStep1 } from '@/lib/sequences/sendAutoResponseStep1'
import { detectAppointmentIntent } from '@/lib/leads/detectAppointmentIntent'
import { normalizePhone } from '@/lib/utils/phone'

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
    .is('merged_at', null)
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
        .is('merged_at', null)

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
      const assignedTo = await resolveLeadAssignee(userId)
      const { data: created, error } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          name: lead.name,
          primary_phone: lead.phone,
          email: lead.email,
          lead_source: lead.source,
          zip_code: lead.zip,
          assigned_to: assignedTo,
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

  // 4. Match vehicle from existing inventory only — never create from a lead
  // The dealer adds vehicles to inventory manually; leads just express interest in a vehicle.
  let vehicleId: string | null = null
  if (lead.vehicle) {
    const normVin = (v: string) => v.trim().toUpperCase().replace(/\s/g, '')

    if (lead.vin) {
      const cleanVin = normVin(lead.vin)
      const { data: vinCandidates } = await supabase
        .from('vehicles')
        .select('id, vin')
        .eq('user_id', userId)
        .not('vin', 'is', null)
      const match = vinCandidates?.find(v => normVin(v.vin ?? '') === cleanVin) ?? null
      if (match) vehicleId = match.id
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

  // Send SMS consent request to new leads with a phone number (double opt-in for TCPA)
  if (!isReInquiry && lead.phone) {
    sendSmsConsentRequest({
      customerId,
      orgId: userId,
      customerName: lead.name,
      phone: lead.phone,
      vehicle: lead.vehicle || null,
    }).catch(() => {})
  }

  // Auto-create a lead_response task due in 10 minutes
  createLeadResponseTask(
    customerId,
    lead.name,
    lead.vehicle ?? null,
    vehicleId,
    userId
  ).catch(() => {})

  // Auto-respond: if org has a default sequence configured, send Step 1 immediately.
  // Runs non-blocking — a failure here never prevents the lead from being ingested.
  const { data: autoSettings } = await supabase
    .from('org_settings')
    .select('auto_respond_email_sequence_id, auto_respond_sms_sequence_id')
    .eq('org_id', userId)
    .maybeSingle()

  if (autoSettings?.auto_respond_email_sequence_id && lead.email) {
    sendAutoResponseStep1({
      orgId:         userId,
      customerId,
      sequenceId:    autoSettings.auto_respond_email_sequence_id,
      channel:       'email',
      customerEmail: lead.email,
      customerName:  lead.name,
    }).catch(() => {})
  }

  if (autoSettings?.auto_respond_sms_sequence_id && lead.phone) {
    sendAutoResponseStep1({
      orgId:         userId,
      customerId,
      sequenceId:    autoSettings.auto_respond_sms_sequence_id,
      channel:       'sms',
      customerPhone: lead.phone,
      customerName:  lead.name,
    }).catch(() => {})
  }

  // Detect appointment intent in lead comments — creates a Today card for the dealer
  if (lead.comments && detectAppointmentIntent(lead.comments)) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    Promise.resolve(
      supabase
        .from('activities')
        .select('id')
        .eq('user_id', userId)
        .eq('customer_id', customerId)
        .eq('type', 'appointment')
        .eq('direction', 'inbound')
        .gte('created_at', oneDayAgo)
        .maybeSingle()
    ).then(({ data: existingAppt }) => {
      if (!existingAppt) {
        Promise.resolve(supabase.from('activities').insert({
          user_id:     userId,
          customer_id: customerId,
          type:        'appointment',
          direction:   'inbound',
          outcome:     'pending',
          priority:    'high',
          body:        lead.comments,
        })).catch((err: unknown) => console.error('[ingest] appointment intent insert failed:', err))
      }
    }).catch((err: unknown) => console.error('[ingest] appointment intent check failed:', err))
  }

  return { status: 'created', customer_id: customerId, vehicle_id: vehicleId, activity_id: activity.id }
}
