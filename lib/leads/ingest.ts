import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedLead } from '@/lib/leads/parser'
import { sendLeadNotification } from '@/lib/push/send'
import { createLeadResponseTask } from '@/lib/tasks/auto'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendSmsConsentRequest } from '@/lib/sms/sendConsent'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'
import { detectAppointmentIntent } from '@/lib/leads/detectAppointmentIntent'
import { normalizePhone } from '@/lib/utils/phone'
import { deriveLeadIntentFromLead, mergeLeadIntent } from '@/lib/leads/intent'
import { pickReInquiryCandidate } from '@/lib/leads/reinquiry'
import { enqueueConversationRescore } from '@/lib/leads/conversationScore'
import { refreshCustomerEngagement } from '@/lib/customers/engagement'
import { emitEvent } from '@/lib/intelligence/emitEvent'
import {
  applyLeadLocationDetection,
  type LeadLocationIngestContext,
} from '@/lib/leads/detectLeadLocation'

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export type IngestLeadOptions = {
  /** Assign the customer to this profile (e.g. staff who captured a scan) so they see the lead on /customers when rep-scoped. */
  capturedByUserId?: string
  /** Context for multi-location auto-detection (Phase 3). */
  location?: LeadLocationIngestContext
}

export async function ingestLead(
  lead: ParsedLead,
  external_id: string,
  orgId: string,
  options?: IngestLeadOptions,
) {
  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    throw new Error('ingest called without orgId')
  }

  const supabase = createServiceClient()
  const userId = orgId

  // 1. Upsert customer — match by email first, then normalized phone
  // Dedup check FIRST — before creating any customer record
  // Prevents orphaned customers when email/phone are blank (e.g. Facebook leads)
  const { data: earlyDup } = await supabase
    .from('activities')
    .select('id, customer_id')
    .eq('external_id', external_id)
    .maybeSingle()
  if (earlyDup)
    return {
      status: 'duplicate',
      activity_id: earlyDup.id,
      customer_id: earlyDup.customer_id ?? undefined,
    }

  let customerId: string
  let existingIntent: {
    lead_intent_tier?: string | null
    lead_intent_score?: number | null
    lead_intent_flags?: string[] | null
    lead_intent_summary?: string | null
    lead_intent_source?: string | null
    lead_intent_manual_note?: string | null
  } | null = null

  // Try email match — must be scoped to this org (critical for SAAS_MODE)
  const { data: existingByEmail } = await supabase
    .from('customers')
    .select('id, lead_intent_tier, lead_intent_score, lead_intent_flags, lead_intent_summary, lead_intent_source, lead_intent_manual_note')
    .eq('user_id', userId)
    .eq('email', lead.email)
    .is('merged_at', null)
    .maybeSingle()

  let isReInquiry = false

  if (existingByEmail) {
    customerId = existingByEmail.id
    isReInquiry = true
    existingIntent = existingByEmail
    // Backfill email if the record came in via voice (may have been blank)
    await supabase.from('customers').update({ email: lead.email }).eq('id', customerId).is('email', null)
  } else {
    // Try phone match (catches customers created by voice ingest).
    // Only match on a real 10-digit US number — garbage or empty normalize must not match blank DB phones.
    let existingByPhone = null
    const normLeadPhone = normalizePhone(lead.phone || '')
    if (normLeadPhone.length === 10) {
      const { data: phoneRows } = await supabase
        .from('customers')
        .select('id, primary_phone, secondary_phone, lead_intent_tier, lead_intent_score, lead_intent_flags, lead_intent_summary, lead_intent_source, lead_intent_manual_note')
        .eq('user_id', userId)
        .is('merged_at', null)

      existingByPhone = phoneRows?.find(c => {
        const p = normalizePhone(c.primary_phone || '')
        const s = normalizePhone(c.secondary_phone || '')
        return p === normLeadPhone || s === normLeadPhone
      }) ?? null
    }

    if (existingByPhone) {
      customerId = existingByPhone.id
      isReInquiry = true
      existingIntent = existingByPhone
      // Backfill email on the matched record
      await supabase.from('customers').update({ email: lead.email }).eq('id', customerId).is('email', null)
    } else {
      if (!lead.email && !lead.phone) {
        const normalizedLeadName = normalizeName(lead.name)
        const { data: nameCandidates } = await supabase
          .from('customers')
          .select('id, name, interested_in, lead_source, lead_intent_tier, lead_intent_score, lead_intent_flags, lead_intent_summary, lead_intent_source, lead_intent_manual_note')
          .eq('user_id', userId)
          .is('merged_at', null)
          .limit(200)

        const matches = (nameCandidates ?? []).filter(candidate => {
          if (normalizeName(candidate.name ?? '') !== normalizedLeadName) return false
          if (lead.vehicle && candidate.interested_in) {
            return candidate.interested_in.toLowerCase().includes(lead.vehicle.toLowerCase())
          }
          return candidate.lead_source === 'cargurus' || candidate.lead_source === 'cargurus_digest'
        })

        if (matches.length === 1) {
          customerId = matches[0].id
          existingIntent = matches[0]
          isReInquiry = true
        } else {
          return { status: 'skipped', reason: 'no_contact_info' }
        }
      } else {
        const { data: nameCandidates } = await supabase
          .from('customers')
          .select('id, name, interested_in, zip_code, lead_source, lead_intent_tier, lead_intent_score, lead_intent_flags, lead_intent_summary, lead_intent_source, lead_intent_manual_note')
          .eq('user_id', userId)
          .ilike('name', lead.name.trim())
          .is('merged_at', null)
          .limit(10)

        const reInquiryMatch = pickReInquiryCandidate(lead, nameCandidates ?? [])
        if (reInquiryMatch) {
          customerId = reInquiryMatch.id
          existingIntent = reInquiryMatch
          isReInquiry = true
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
              assigned_to: options?.capturedByUserId ?? null,
            })
            .select('id')
            .single()

          if (error || !created) {
            return { error: error?.message || 'Failed to create customer' }
          }
          customerId = created.id
          existingIntent = null

          // Set initial lead state for brand-new customers (no-op if already set)
          await supabase.rpc('advance_lead_state', {
            p_customer_id: customerId,
            p_new_state:   'new_lead',
            p_reason:      `New lead from ${lead.source}`,
          })
        }
      }
    }
  }

  await applyLeadLocationDetection({
    customerId,
    orgId: userId,
    context: options?.location,
    customerPhone: lead.phone,
    supabase,
  })

  await applyAutoLeadAssignment({
    customerId,
    orgId: userId,
    capturedByUserId: options?.capturedByUserId,
    supabase,
  })

  // Mark as hot if source declared it or customer is re-inquiring
  const shouldMarkHot = lead.is_hot || lead.is_reengaged || isReInquiry
  const intentSnapshot = deriveLeadIntentFromLead(lead, isReInquiry)
  const customerPatch: Record<string, unknown> = {}
  if (shouldMarkHot) {
    customerPatch.lead_rating = 'hot'
  }
  if (isReInquiry) {
    customerPatch.repeat_lead = true
  }
  if (intentSnapshot) {
    const mergedIntent = mergeLeadIntent({
      tier: existingIntent?.lead_intent_tier,
      score: existingIntent?.lead_intent_score,
      flags: existingIntent?.lead_intent_flags,
      summary: existingIntent?.lead_intent_summary,
      source: existingIntent?.lead_intent_source,
      manualNote: existingIntent?.lead_intent_manual_note,
    }, intentSnapshot)
    customerPatch.lead_intent_score = mergedIntent.score
    customerPatch.lead_intent_tier = mergedIntent.tier
    customerPatch.lead_intent_flags = mergedIntent.flags
    customerPatch.lead_intent_summary = mergedIntent.summary
    customerPatch.lead_intent_source = mergedIntent.source
    customerPatch.lead_intent_updated_at = mergedIntent.updatedAt
  }
  if (Object.keys(customerPatch).length > 0) {
    await supabase.from('customers').update(customerPatch).eq('id', customerId)
  }

  if (options?.capturedByUserId) {
    await supabase.from('customers').update({ assigned_to: options.capturedByUserId }).eq('id', customerId)
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

  if (recentLead && !intentSnapshot)
    return { status: 'duplicate', activity_id: recentLead.id, customer_id: customerId }

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

    // Fallback: match by year + make + model when no VIN (e.g. CarGurus phone leads)
    if (!vehicleId) {
      const ymMatch = lead.vehicle.match(/^(\d{4})\s+(\S+)\s+(.+)/)
      if (ymMatch) {
        const [, yearStr, make, modelRest] = ymMatch
        const { data: ymCandidates } = await supabase
          .from('vehicles')
          .select('id, year, make, model, trim')
          .eq('user_id', userId)
          .eq('year', parseInt(yearStr, 10))
          .ilike('make', make)
          .eq('status', 'available')
        if (ymCandidates && ymCandidates.length > 0) {
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
          const leadModel = norm(modelRest)
          const hit =
            ymCandidates.find(v => leadModel.includes(norm(v.model))) ??
            ymCandidates.find(v => norm(v.model).includes(norm(modelRest.split(/\s+/)[0]))) ??
            (ymCandidates.length === 1 ? ymCandidates[0] : null)
          if (hit) vehicleId = hit.id
        }
      }
    }

    if (vehicleId) {
      const { data: existingLink } = await supabase.from('customer_vehicles').select('id').eq('customer_id', customerId).eq('vehicle_id', vehicleId).maybeSingle()
      if (!existingLink) {
        await supabase.from('customer_vehicles').insert({ customer_id: customerId, vehicle_id: vehicleId, interest_level: 'hot' })
      }
    }
  }

  // 5. Create inbound lead activity
  const isSignalOnlyUpdate = !lead.email && !lead.phone && !!intentSnapshot
  const activityBody = isSignalOnlyUpdate
    ? [
        'Marketplace shopper signal received.',
        lead.vehicle ? `Vehicle: ${lead.vehicle}` : '',
        intentSnapshot?.summary ?? '',
        lead.comments ? `"${lead.comments}"` : '',
      ].filter(Boolean).join('\n')
    : [
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
      type: isSignalOnlyUpdate ? 'note' : 'email',
      direction: 'inbound',
      outcome: isSignalOnlyUpdate ? 'answered' : 'pending',
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
  }, userId).catch(() => {})

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
    import('@/lib/sequences/sendAutoResponseStep1')
      .then(({ sendAutoResponseStep1 }) => sendAutoResponseStep1({
        orgId:         userId,
        customerId,
        sequenceId:    autoSettings.auto_respond_email_sequence_id,
        channel:       'email',
        customerEmail: lead.email,
        customerName:  lead.name,
      }))
      .catch(() => {})
  }

  if (autoSettings?.auto_respond_sms_sequence_id && lead.phone) {
    import('@/lib/sequences/sendAutoResponseStep1')
      .then(({ sendAutoResponseStep1 }) => sendAutoResponseStep1({
        orgId:         userId,
        customerId,
        sequenceId:    autoSettings.auto_respond_sms_sequence_id,
        channel:       'sms',
        customerPhone: lead.phone,
        customerName:  lead.name,
      }))
      .catch(() => {})
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

  enqueueConversationRescore({
    customerId,
    orgId: userId,
    trigger: 'ingest',
    force: true,
  })

  void refreshCustomerEngagement(supabase, customerId)

  emitEvent({
    orgId:      userId,
    eventType:  'lead_received',
    entityType: 'lead',
    entityId:   customerId,
    channel:    'system',
    direction:  'inbound',
    metadata: {
      source:      lead.source,
      vehicle_id:  vehicleId ?? null,
      is_reinquiry: isReInquiry,
      activity_id: activity.id,
    },
  }).catch(() => {})

  return { status: 'created', customer_id: customerId, vehicle_id: vehicleId, activity_id: activity.id }
}
