import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLeadNotification } from '@/lib/push/send'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { detectAppointment } from '@/lib/sms/detectAppointment'
import { incrementUsage } from '@/lib/sms/quota'
import { transitionThreadState } from '@/lib/sms/threadState'
import { getOrgIdByPhone } from '@/lib/orgs/lookup'
import { parseDealerAppointment } from '@/lib/sms/parseDealerCommand'
import { isOfferUpLead, parseOfferUpLead } from '@/lib/sms/parseOfferUpLead'
import { createCalendarEvent } from '@/lib/google/calendar'
import crypto from 'crypto'

// Twilio sends form-encoded POST to this endpoint when a customer texts your number.
// Webhook URL to set in Twilio console (no ?secret= needed — we use HMAC-SHA1 now):
//   https://dealerwyze.com/api/twilio/inbound

const TWIML_EMPTY = '<Response/>'

/**
 * Validate Twilio's X-Twilio-Signature using HMAC-SHA1.
 * Spec: https://www.twilio.com/docs/usage/security#validating-signatures-from-twilio
 */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  // Build the signed string: URL + sorted param key-value pairs concatenated
  const sortedParams = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + sortedParams)
    .digest('base64')
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// TCPA: keywords that trigger opt-out (case-insensitive, exact word)
const OPT_OUT_KEYWORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const OPT_IN_KEYWORDS   = new Set(['START', 'UNSTOP', 'YES'])

function twimlMsg(text: string) {
  return `<Response><Message>${text}</Message></Response>`
}

/** Strip non-digits, normalise to 10-digit US number */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

export async function POST(req: NextRequest) {
  // Twilio sends application/x-www-form-urlencoded
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  // Validate Twilio HMAC-SHA1 signature (stronger than query-param secret)
  // Falls back to legacy ?secret= check so existing Twilio config keeps working
  // during the transition period. Remove the fallback once Twilio webhook URL is updated.
  const authToken   = process.env.TWILIO_AUTH_TOKEN ?? ''
  const signature   = req.headers.get('x-twilio-signature') ?? ''
  const webhookUrl  = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'}/api/twilio/inbound`
  const legacySecret = req.nextUrl.searchParams.get('secret')

  const hmacValid   = authToken && signature
    ? validateTwilioSignature(authToken, signature, webhookUrl, params)
    : false

  // Legacy ?secret= fallback — only active when TWILIO_LEGACY_FALLBACK_ENABLED=true.
  // Remove this flag (and the legacySecret block below) once Twilio webhook URL no
  // longer includes ?secret= and HMAC is confirmed working in production.
  const legacyEnabled = process.env.TWILIO_LEGACY_FALLBACK_ENABLED === 'true'
  const legacyValid   = legacyEnabled && legacySecret === process.env.LEADS_POLL_SECRET

  if (!hmacValid && !legacyValid) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (!hmacValid && legacyValid) {
    console.warn('[twilio/inbound] HMAC validation failed — accepted via legacy secret fallback. Update Twilio webhook URL to remove ?secret=.')
  }

  const fromRaw    = params.From  || ''
  const toRaw      = params.To    || ''
  const body       = (params.Body || '').trim()
  const messageSid = params.MessageSid || ''

  if (!fromRaw || !body) {
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  const fromNorm  = normalizePhone(fromRaw)
  const bodyUpper = body.toUpperCase()
  const isOptOut  = OPT_OUT_KEYWORDS.has(bodyUpper)
  const isOptIn   = OPT_IN_KEYWORDS.has(bodyUpper)

  const supabase = createServiceClient()

  // Resolve which org this message belongs to (multi-tenant: keyed by "To" number)
  const orgId = await getOrgIdByPhone(toRaw)

  // Fail-fast: unknown "To" number means no org — return empty TwiML, do not query any data
  if (!orgId) {
    console.warn('[twilio/inbound] Could not resolve org from To number:', toRaw)
    return new NextResponse(TWIML_EMPTY, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  // ── Dealer command: inbound SMS from the dealer's own cell ─────────────────
  // e.g. "Tim wants to see the 2009 Acura MDX on Monday at 2pm"
  if (orgId) {
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('dealer_cell_number, locations')
      .eq('org_id', orgId)
      .maybeSingle()

    const rawLocations = orgSettings?.locations as Array<{ name: string }> | null
    const locationNames = rawLocations?.map(l => l.name).filter(Boolean) ?? []

    const dealerCell = orgSettings?.dealer_cell_number
      ? normalizePhone(orgSettings.dealer_cell_number)
      : null

    if (dealerCell && fromNorm === dealerCell) {

      // ── OfferUp lead forward ──────────────────────────────────────────────
      if (isOfferUpLead(body)) {
        const lead = parseOfferUpLead(body)

        if (!lead) {
          return new NextResponse(
            twimlMsg('Could not parse OfferUp lead. Check format and try again.'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }

        // Format phone for display
        const phoneDigits = lead.phone ?? ''
        const phoneDisplay = phoneDigits.length === 10
          ? `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`
          : lead.phone

        // Find or create customer by phone, then by name
        let customerId: string
        let isNew = false

        const { data: existing } = await supabase
          .from('customers')
          .select('id, name')
          .eq('user_id', orgId)
          .eq('primary_phone', phoneDisplay ?? '')
          .maybeSingle()

        if (existing) {
          customerId = existing.id
        } else {
          const { data: newCust, error: insertErr } = await supabase
            .from('customers')
            .insert({
              user_id:       orgId,
              name:          lead.name,
              primary_phone: phoneDisplay ?? lead.name,
              email:         lead.email ?? null,
              lead_source:   'offerup',
              interested_in: lead.vehicle ?? null,
              notes:         lead.note ? `OfferUp: ${lead.note}` : 'OfferUp lead',
            })
            .select('id')
            .single()

          if (insertErr || !newCust) {
            return new NextResponse(
              twimlMsg('Failed to create contact. Please try again.'),
              { status: 200, headers: { 'Content-Type': 'text/xml' } }
            )
          }
          customerId = newCust.id
          isNew = true
        }

        // Log inbound activity
        await supabase.from('activities').insert({
          user_id:      orgId,
          customer_id:  customerId,
          type:         'note',
          direction:    'inbound',
          outcome:      'answered',
          priority:     'high',
          body:         `OfferUp lead forwarded by dealer.\n${lead.note ? `Buyer message: "${lead.note}"` : ''}`.trim(),
          completed_at: new Date().toISOString(),
        })

        const status = isNew ? '✅ New contact created' : '✅ Existing contact updated'
        return new NextResponse(
          twimlMsg(`${status}: ${lead.name}${phoneDisplay ? ` (${phoneDisplay})` : ''}${lead.note ? ` — "${lead.note}"` : ''}`),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }

      // ── Dealer appointment command ────────────────────────────────────────
      const parsed = await parseDealerAppointment(body, locationNames).catch(() => null)

      if (!parsed || !parsed.customer_name) {
        return new NextResponse(
          twimlMsg('Could not parse appointment. Try: "[Name] wants to see [vehicle] on [day] at [time]"'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }

      // Find or create customer by name
      const { data: nameMatches } = await supabase
        .from('customers')
        .select('id, name')
        .eq('user_id', orgId)
        .ilike('name', `%${parsed.customer_name}%`)
        .limit(3)

      let customerId: string

      if (nameMatches && nameMatches.length === 1) {
        customerId = nameMatches[0].id
      } else if (nameMatches && nameMatches.length > 1) {
        // Prefer exact match
        const exact = nameMatches.find(c => c.name.toLowerCase() === parsed.customer_name!.toLowerCase())
        customerId = exact ? exact.id : nameMatches[0].id
      } else {
        // Create minimal customer record
        const digits = parsed.customer_phone?.replace(/\D/g, '') ?? null
        const phone  = digits ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : null
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({ user_id: orgId, name: parsed.customer_name, primary_phone: phone, lead_source: 'dealer_sms' })
          .select('id')
          .single()
        if (!newCustomer) {
          return new NextResponse(
            twimlMsg('Failed to create customer. Please try again.'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        customerId = newCustomer.id
      }

      // Parse appointment datetime
      const apptDate = parsed.appointment_datetime
        ? new Date(`${parsed.appointment_datetime.replace(' ', 'T')}:00-08:00`)
        : null

      const locationLabel = parsed.location ?? null
      const vehicleLabel  = parsed.vehicle ?? 'vehicle inquiry'
      const bodyText = [
        `${parsed.customer_name} — ${vehicleLabel}`,
        locationLabel ? `@ ${locationLabel}` : '',
        parsed.notes ?? '',
      ].filter(Boolean).join(' ')

      // Create appointment activity
      await supabase.from('activities').insert({
        user_id:     orgId,
        customer_id: customerId,
        type:        'appointment',
        direction:   'inbound',
        outcome:     'pending',
        priority:    'high',
        body:        bodyText,
        due_at:      apptDate?.toISOString() ?? null,
      })

      // Google Calendar event
      if (apptDate && parsed.appointment_datetime) {
        createCalendarEvent({
          summary:     `Appt: ${parsed.customer_name} — ${vehicleLabel}`,
          description: [
            `Customer: ${parsed.customer_name}`,
            parsed.customer_phone ? `Phone: ${parsed.customer_phone}` : '',
            `Vehicle: ${vehicleLabel}`,
            locationLabel ? `Location: ${locationLabel}` : '',
            parsed.notes ? `Notes: ${parsed.notes}` : '',
          ].filter(Boolean).join('\n'),
          location:  locationLabel ?? undefined,
          startIso:  parsed.appointment_datetime,
        }, orgId).catch(() => {})
      }

      // Confirm back to dealer
      const timeStr = apptDate
        ? apptDate.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
            timeZone: 'America/Los_Angeles',
          })
        : 'time TBD'

      return new NextResponse(
        twimlMsg(`✅ Appointment created: ${parsed.customer_name} — ${vehicleLabel} — ${timeStr}${locationLabel ? ` @ ${locationLabel}` : ''}`),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
  }

  // Find customer by phone number, scoped to org
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, name, user_id, primary_phone, secondary_phone, sms_opt_out, unsubscribe_sms')
    .eq('user_id', orgId)

  const customer = allCustomers?.find(c => {
    const primary   = normalizePhone(c.primary_phone || '')
    const secondary = normalizePhone(c.secondary_phone || '')
    return primary === fromNorm || secondary === fromNorm
  })

  // Fetch org name for TCPA compliance messages
  let tcpaBizName = 'this service'
  let tcpaOptOutMsg: string | null = null
  let tcpaOptInMsg: string | null = null
  if (orgId) {
    const { data: tcpaSettings } = await supabase
      .from('org_settings')
      .select('business_name, sms_opt_out_message, sms_opt_in_message')
      .eq('org_id', orgId)
      .maybeSingle()
    tcpaBizName   = tcpaSettings?.business_name    ?? tcpaBizName
    tcpaOptOutMsg = tcpaSettings?.sms_opt_out_message ?? null
    tcpaOptInMsg  = tcpaSettings?.sms_opt_in_message  ?? null
  }

  // ── TCPA opt-out ─────────────────────────────────────────────────────────
  if (isOptOut) {
    if (customer) {
      const now = new Date().toISOString()
      await supabase
        .from('customers')
        .update({ sms_opt_out: true, sms_opt_out_at: now, unsubscribe_sms: true, unsubscribed_at: now })
        .eq('id', customer.id)

      await supabase.from('activities').insert({
        user_id: customer.user_id,
        customer_id: customer.id,
        type: 'sms',
        direction: 'inbound',
        outcome: 'opted_out',
        body,
        priority: 'normal',
        external_id: messageSid || null,
        completed_at: now,
      })

      // Cancel any active SMS sequences for this customer
      const { data: activeSeqs } = await supabase
        .from('customer_sequences')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('status', 'active')

      for (const seq of activeSeqs ?? []) {
        await supabase
          .from('customer_sequences')
          .update({ status: 'cancelled', completed_at: now })
          .eq('id', seq.id)
        await supabase
          .from('activities')
          .update({ completed_at: now, outcome: 'cancelled' })
          .eq('customer_sequence_id', seq.id)
          .is('completed_at', null)
          .in('type', ['sms_followup', 'email_followup'])
      }
    }
    // TCPA requires a confirmation reply — send it regardless of customer match
    const optOutReply = tcpaOptOutMsg
      ?? `You have been unsubscribed from ${tcpaBizName} messages. Text START to resubscribe.`
    return new NextResponse(
      twimlMsg(optOutReply),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // ── TCPA opt-in (re-subscribe) ────────────────────────────────────────────
  if (isOptIn) {
    if (customer) {
      await supabase
        .from('customers')
        .update({ sms_opt_out: false, sms_opt_out_at: null })
        .eq('id', customer.id)

      await supabase.from('activities').insert({
        user_id: customer.user_id,
        customer_id: customer.id,
        type: 'sms',
        direction: 'inbound',
        outcome: 'opted_in',
        body,
        priority: 'normal',
        external_id: messageSid || null,
        completed_at: new Date().toISOString(),
      })
    }
    const optInReply = tcpaOptInMsg
      ?? `You have been re-subscribed to ${tcpaBizName} messages. Reply STOP at any time to unsubscribe.`
    return new NextResponse(
      twimlMsg(optInReply),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // ── Normal inbound message ────────────────────────────────────────────────
  if (customer) {
    await supabase.from('activities').insert({
      user_id: customer.user_id,
      customer_id: customer.id,
      type: 'sms',
      direction: 'inbound',
      outcome: 'answered',
      body,
      priority: 'normal',
      external_id: messageSid || null,
      completed_at: new Date().toISOString(),
    })

    // Increment org SMS usage counter (fire and forget)
    incrementUsage(customer.user_id, false).catch(() => {})

    // Thread state transition (fire and forget)
    transitionThreadState(customer.id, 'inbound_received').catch(() => {})

    // Appointment detection
    const hint = detectAppointment(body)
    if (hint.detected) {
      await supabase.from('activities').insert({
        user_id: customer.user_id,
        customer_id: customer.id,
        type: 'appointment',
        direction: 'inbound',
        outcome: 'pending',
        body,
        priority: 'high',
        due_at: hint.suggestedDate?.toISOString() ?? null,
        completed_at: null,
      })
    }

    // Push notification
    try {
      const notifBody = hint.detected
        ? `📅 Appointment request: ${body.length > 80 ? body.slice(0, 77) + '…' : body}`
        : body.length > 100 ? body.slice(0, 97) + '…' : body

      await sendLeadNotification({
        title: `Text from ${customer.name}`,
        body: notifBody,
        url: `/customers/${customer.id}`,
      })
    } catch {
      // Non-fatal
    }

    sendTelegramMessage(
      `<b>${hint.detected ? '📅 Appt request' : 'Inbound text'}</b> from ${customer.name}\n` +
      (body.length > 160 ? body.slice(0, 157) + '...' : body)
    ).catch(() => {})
  } else {
    // Unknown number — new potential lead
    sendTelegramMessage(
      `<b>Unknown texter</b> - not in your contacts\n` +
      `From: ${fromRaw}\n` +
      `"${body.length > 160 ? body.slice(0, 157) + '...' : body}"`
    ).catch(() => {})
  }

  return new NextResponse(TWIML_EMPTY, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
