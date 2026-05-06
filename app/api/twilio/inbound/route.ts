import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLeadNotification } from '@/lib/push/send'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { detectAppointment } from '@/lib/sms/detectAppointment'
import { incrementUsage } from '@/lib/sms/quota'
import { transitionThreadState } from '@/lib/sms/threadState'
import { getOrgIdByPhone } from '@/lib/orgs/lookup'
import { parseDealerAppointment } from '@/lib/sms/parseDealerCommand'
import { isOfferUpLead, parseOfferUpLead } from '@/lib/leads/parseOfferUpSms'
import { createCalendarEvent } from '@/lib/google/calendar'
import { stopSequenceOnReply, cancelSequenceOnUnsubscribe } from '@/lib/sequences/stopSequenceOnReply'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import crypto from 'crypto'
import { normalizePhone } from '@/lib/utils/phone'
import { getTwilioWebhookBase, validateTwilioSignature } from '@/lib/twilio/signature'
import { enqueueConversationRescore } from '@/lib/leads/conversationScore'
import { writeAuditLog } from '@/lib/audit/log'
import { emitEvent } from '@/lib/intelligence/emitEvent'

// Twilio sends form-encoded POST to this endpoint when a customer texts your number.
// Webhook URL to set in Twilio console (no ?secret= needed — we use HMAC-SHA1 now):
//   https://dealerwyze.com/api/twilio/inbound

const TWIML_EMPTY = '<Response/>'

// TCPA: keywords that trigger opt-out (case-insensitive, exact word)
const OPT_OUT_KEYWORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const OPT_IN_KEYWORDS   = new Set(['START', 'UNSTOP', 'YES'])

function twimlMsg(text: string) {
  return `<Response><Message>${text}</Message></Response>`
}

export async function POST(req: NextRequest) {
  // Twilio sends application/x-www-form-urlencoded
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  // Validate Twilio HMAC-SHA1 signature (stronger than query-param secret)
  // Falls back to legacy Authorization header secret so existing Twilio config keeps working
  // during the transition period. Remove the fallback once HMAC is confirmed working in production.
  const authToken   = process.env.TWILIO_AUTH_TOKEN ?? ''
  const signature   = req.headers.get('x-twilio-signature') ?? ''
  const webhookUrl  = `${getTwilioWebhookBase()}/api/twilio/inbound`

  // Legacy fallback reads secret from Authorization: Bearer header (not URL query param)
  const legacyAuthHeader = req.headers.get('authorization')
  const legacySecret = legacyAuthHeader?.startsWith('Bearer ') ? legacyAuthHeader.slice(7) : null

  const hmacValid   = authToken && signature
    ? validateTwilioSignature(authToken, signature, webhookUrl, params)
    : false

  // Legacy Authorization-header fallback — only active when TWILIO_LEGACY_FALLBACK_ENABLED=true.
  // Remove this flag (and the legacySecret block below) once Twilio HMAC is confirmed working in production.
  const legacyEnabled = process.env.TWILIO_LEGACY_FALLBACK_ENABLED === 'true'
  const legacyExpected = Buffer.from(process.env.LEADS_POLL_SECRET ?? '')
  const legacyProvided = Buffer.from(legacySecret ?? '')
  const legacyValid =
    legacyEnabled &&
    legacyExpected.length > 0 &&
    legacyExpected.length === legacyProvided.length &&
    crypto.timingSafeEqual(legacyExpected, legacyProvided)

  if (!hmacValid && !legacyValid) {
    void writeAuditLog({
      orgId:     null,
      actorId:   null,
      actorType: 'user',
      action:    'webhook_auth_failure',
      metadata:  { path: '/api/twilio/inbound', reason: 'invalid_signature' },
    })
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

        if (isNew) {
          dispatchWebhook(orgId, 'new_lead', {
            customer_id: customerId,
            name: lead.name,
            phone: lead.phone ?? null,
            source: 'offerup',
          }).catch(() => {})
        }

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
        dispatchWebhook(orgId, 'new_lead', {
          customer_id: newCustomer.id,
          name: parsed.customer_name,
          phone: parsed.customer_phone ?? null,
          source: 'dealer_sms',
        }).catch(() => {})
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

      dispatchWebhook(orgId, 'appointment_created', {
        customer_id: customerId,
        due_at: apptDate?.toISOString() ?? null,
        body: bodyText,
        source: 'dealer_sms',
      }).catch(() => {})

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

  // Two indexed lookups against generated normalized-phone columns (migration 118).
  // Replaces the prior full-org table scan.
  const CUSTOMER_SELECT = 'id, name, user_id, primary_phone, secondary_phone, sms_opt_out, unsubscribe_sms, sms_consent_status'
  const [{ data: byPrimary }, { data: bySecondary }] = await Promise.all([
    supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('user_id', orgId)
      .eq('primary_phone_norm', fromNorm)
      .limit(1),
    supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('user_id', orgId)
      .eq('secondary_phone_norm', fromNorm)
      .limit(1),
  ])
  const customer = byPrimary?.[0] ?? bySecondary?.[0] ?? null

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

      // Cancel SMS sequences and mark unsubscribed
      await cancelSequenceOnUnsubscribe({ supabase, customerId: customer.id, channel: 'sms' })
    }
    // TCPA requires a confirmation reply — send it regardless of customer match
    const optOutReply = tcpaOptOutMsg
      ?? `You have been unsubscribed from ${tcpaBizName} messages. Text START to resubscribe.`
    return new NextResponse(
      twimlMsg(optOutReply),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // ── TCPA opt-in / consent confirmation ───────────────────────────────────
  if (isOptIn) {
    const isPendingConsent = customer?.sms_consent_status === 'pending'
    if (customer) {
      const now = new Date().toISOString()
      await supabase
        .from('customers')
        .update({
          sms_opt_out:  false,
          sms_opt_out_at: null,
          ...(isPendingConsent ? {
            sms_consent_status:       'confirmed',
            sms_consent_confirmed_at: now,
          } : {}),
        })
        .eq('id', customer.id)

      await supabase.from('activities').insert({
        user_id: customer.user_id,
        customer_id: customer.id,
        type: 'sms',
        direction: 'inbound',
        outcome: 'opted_in',
        body,
        priority: isPendingConsent ? 'high' : 'normal',
        external_id: messageSid || null,
        completed_at: now,
      })

      // Notify dealer when a consent request is confirmed
      if (isPendingConsent) {
        sendLeadNotification({
          title: `${customer.name} confirmed SMS`,
          body:  'They replied YES — you can now text them.',
          url:   `/customers/${customer.id}`,
        }, orgId).catch(() => {})
        sendTelegramMessage(
          `<b>SMS consent confirmed</b>\n${customer.name} replied YES — ready to text.`
        ).catch(() => {})
      }
    }
    const optInReply = isPendingConsent
      ? `Thanks! You're now subscribed to text updates from ${tcpaBizName}. Reply STOP at any time to unsubscribe.`
      : (tcpaOptInMsg ?? `You have been re-subscribed to ${tcpaBizName} messages. Reply STOP at any time to unsubscribe.`)
    return new NextResponse(
      twimlMsg(optInReply),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // ── BHPH payment confirmation ("PAY") ────────────────────────────────────
  if (bodyUpper === 'PAY' && customer) {
    const now = new Date().toISOString()
    await supabase.from('activities').insert({
      user_id:      customer.user_id,
      customer_id:  customer.id,
      type:         'sms',
      direction:    'inbound',
      outcome:      'answered',
      body:         'Customer confirmed they are coming in to make their payment.',
      priority:     'high',
      external_id:  messageSid || null,
      completed_at: now,
    })
    // Notify dealer via push
    sendLeadNotification({
      title: `${customer.name} confirmed payment`,
      body:  'They replied PAY - expect them in today.',
      url:   `/customers/${customer.id}`,
    }, orgId).catch(() => {})
    return new NextResponse(
      twimlMsg(`Thanks! We have you confirmed for today. See you soon from ${tcpaBizName}.`),
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

    emitEvent({
      orgId:      customer.user_id,
      eventType:  'message_received',
      entityType: 'customer',
      entityId:   customer.id,
      channel:    'sms',
      direction:  'inbound',
      metadata: {
        hour_of_day: new Date().getUTCHours(),
        day_of_week: new Date().getUTCDay(),
      },
    }).catch(() => {})

    // Stop any active autoresponder sequences — customer replied
    await stopSequenceOnReply({
      supabase,
      orgId:        customer.user_id,
      customerId:   customer.id,
      customerName: customer.name,
      channel:      'sms',
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
      }, orgId)
    } catch {
      // Non-fatal
    }

    sendTelegramMessage(
      `<b>${hint.detected ? '📅 Appt request' : 'Inbound text'}</b> from ${customer.name}\n` +
      (body.length > 160 ? body.slice(0, 157) + '...' : body)
    ).catch(() => {})

    enqueueConversationRescore({
      customerId: customer.id,
      orgId: customer.user_id,
      trigger: 'inbound_sms',
    })
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
