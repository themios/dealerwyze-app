import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgActiveLocations, isMultiLocationOrg } from '@/lib/locations/resolve'
import type { DealerLocation } from '@/lib/locations/types'
import { normalizePhone } from '@/lib/utils/phone'
import { sendOutboundSms } from '@/lib/sms/sendOutbound'

export type LocationSource = 'inbound_sms' | 'email_parsed' | 'auto_single'

export type LeadLocationIngestContext = {
  /** Twilio inbound: dealer line the customer texted (Twilio `To`), matched to `dealer_locations.sms_number`. */
  inboundSmsFrom?: string
  emailSubject?: string
  emailBody?: string
}

const FALLBACK_SMS_MARKER = 'locations ready to help'

function normalizeSmsNumber(raw: string | null | undefined): string {
  return normalizePhone(raw ?? '')
}

function extractCityFragments(address: string | null | undefined): string[] {
  if (!address?.trim()) return []
  const parts = address.split(',').map(p => p.trim()).filter(p => p.length >= 2)
  const fragments = new Set<string>()
  for (const part of parts) {
    fragments.add(part)
    const cityOnly = part.replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/i, '').trim()
    if (cityOnly.length >= 2) fragments.add(cityOnly)
  }
  return [...fragments]
}

function emailHaystack(ctx: LeadLocationIngestContext): string {
  return [ctx.emailSubject, ctx.emailBody].filter(Boolean).join('\n').toLowerCase()
}

export function detectLeadLocation(
  ctx: LeadLocationIngestContext,
  locations: DealerLocation[],
): { locationId: string; source: LocationSource } | null {
  if (locations.length === 0) return null

  // 1. inbound_sms — exact match on dealer inbound SMS number
  if (ctx.inboundSmsFrom) {
    const fromNorm = normalizeSmsNumber(ctx.inboundSmsFrom)
    if (fromNorm.length >= 10) {
      const hit = locations.find(
        loc => loc.sms_number && normalizeSmsNumber(loc.sms_number) === fromNorm,
      )
      if (hit) return { locationId: hit.id, source: 'inbound_sms' }
    }
  }

  // 2. email_parsed — exactly one location matches name/address/city fragments
  const haystack = emailHaystack(ctx)
  if (haystack.length > 0) {
    const matched = locations.filter(loc => {
      const needles: string[] = []
      if (loc.name?.trim()) needles.push(loc.name.trim())
      if (loc.address?.trim()) {
        needles.push(loc.address.trim())
        needles.push(...extractCityFragments(loc.address))
      }
      return needles.some(n => n.length >= 2 && haystack.includes(n.toLowerCase()))
    })
    if (matched.length === 1) {
      return { locationId: matched[0].id, source: 'email_parsed' }
    }
  }

  // 3. auto_single
  if (locations.length === 1) {
    return { locationId: locations[0].id, source: 'auto_single' }
  }

  return null
}

function buildFallbackSmsBody(locationCount: number): string {
  return (
    `Thanks for reaching out! We have ${locationCount} locations ready to help. ` +
    'Reply with your preferred location or a team member will be in touch shortly.'
  )
}

async function hasSentFallbackSms(
  supabase: SupabaseClient,
  customerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('activities')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', 'sms')
    .eq('direction', 'outbound')
    .ilike('body', `%${FALLBACK_SMS_MARKER}%`)
    .limit(1)
    .maybeSingle()
  return !!data
}

async function maybeSendUnresolvedLocationSms(params: {
  supabase: SupabaseClient
  orgId: string
  customerId: string
  phone: string | null | undefined
  locationCount: number
}): Promise<void> {
  const { supabase, orgId, customerId, phone, locationCount } = params
  if (!phone?.trim() || locationCount < 2) return

  if (await hasSentFallbackSms(supabase, customerId)) return

  const body = buildFallbackSmsBody(locationCount)
  try {
    await sendOutboundSms({
      orgId,
      to: phone,
      body,
      customerId,
      markInboundAddressed: false,
    })
  } catch {
    // Non-fatal — ingest must not fail
  }
}

/**
 * After a customer/lead row exists: detect location, update customer, optionally send fallback SMS.
 * Never throws — callers should not await unless wrapped; failures are swallowed internally.
 */
export async function applyLeadLocationDetection(params: {
  customerId: string
  orgId: string
  context?: LeadLocationIngestContext
  customerPhone?: string | null
  supabase?: SupabaseClient
}): Promise<void> {
  try {
    const supabase = params.supabase ?? createServiceClient()
    const { customerId, orgId, context = {}, customerPhone } = params

    const { data: customer } = await supabase
      .from('customers')
      .select('id, location_id, primary_phone, secondary_phone')
      .eq('id', customerId)
      .eq('user_id', orgId)
      .maybeSingle()

    if (!customer || customer.location_id) return

    const locations = await getOrgActiveLocations(orgId, supabase)
    const detected = detectLeadLocation(context, locations)

    if (detected) {
      await supabase
        .from('customers')
        .update({
          location_id: detected.locationId,
          location_source: detected.source,
        })
        .eq('id', customerId)
      return
    }

    const multi = await isMultiLocationOrg(orgId, supabase)
    if (!multi) return

    const phone =
      customerPhone ??
      customer.primary_phone ??
      customer.secondary_phone ??
      null

    await maybeSendUnresolvedLocationSms({
      supabase,
      orgId,
      customerId,
      phone,
      locationCount: locations.length,
    })
  } catch {
    // Detection must never block ingest
  }
}
