import { createServiceClient } from '@/lib/supabase/service'
import { sendLeadNotification } from '@/lib/push/send'
import { createLeadResponseTask } from '@/lib/tasks/auto'
import { generateVoiceSummary } from './summarize'
import { createCalendarEvent } from '@/lib/google/calendar'
import { normalizePhone } from '@/lib/utils/phone'
import { emitEvent } from '@/lib/intelligence/emitEvent'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'
import { getOrgActiveLocations, resolveLeadOutboundIdentity } from '@/lib/locations/resolve'

function formatPhone(raw: string): string {
  const ten = normalizePhone(raw)
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  return raw
}

interface VoiceCallParams {
  call_sid:   string
  org_id:     string
  from:       string   // raw Twilio From number
  name:       string
  vehicle:    string
  phone:      string   // confirmed callback phone (may differ from `from`)
  timeline:   string
  duration:   number   // seconds
  transcript?: string  // full VAPI transcript for Anthropic extraction
}

/**
 * Post-call processing. Called fire-and-forget from /api/voice/complete.
 * 1. Upsert customer by phone
 * 2. Create inbound call activity
 * 3. Create lead_response task
 * 4. Update voice_calls record (customer_id, activity_id, task_id)
 * 5. Generate AI summary and store in voice_calls.summary_json
 * 6. Increment voice usage
 * 7. Push notification
 */
export async function processVoiceCall(params: VoiceCallParams): Promise<void> {
  const { call_sid, org_id, from, name, vehicle, phone, timeline, duration, transcript } = params
  const supabase = createServiceClient()
  const userId   = org_id
  const claimTime = new Date().toISOString()
  let completed = false

  // Claim this call before any customer/activity side effects.
  // This makes webhook retries and concurrent deliveries a no-op.
  const { data: claimed, error: claimError } = await supabase
    .from('voice_calls')
    .update({ processing_started_at: claimTime })
    .eq('call_sid', call_sid)
    .is('processed_at', null)
    .is('processing_started_at', null)
    .select('call_sid')
    .maybeSingle()

  if (claimError) {
    console.error('[voice/ingest] Failed to claim voice call row', { call_sid, error: claimError.message })
    return
  }
  if (!claimed) {
    console.log('[voice/ingest] Duplicate or in-flight webhook ignored for call_sid', call_sid)
    return
  }

  try {
    // 1. Upsert customer by callback phone (normalize)
    const normalFrom    = normalizePhone(from)
    const normalPhone   = phone ? normalizePhone(phone) : normalFrom
    const callbackPhone = normalPhone || normalFrom

    let customerId: string | null = null

    // Try to find existing customer by phone (scoped to org)
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, primary_phone, secondary_phone')
      .eq('user_id', userId)
      .is('merged_at', null)

    const existing = allCustomers?.find(c => {
      const p  = normalizePhone(c.primary_phone || '')
      const s  = normalizePhone(c.secondary_phone || '')
      return p === callbackPhone || s === callbackPhone || p === normalFrom || s === normalFrom
    })

    if (existing) {
      customerId = existing.id
    } else {
      const displayPhone = callbackPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
      const { data: created, error } = await supabase
        .from('customers')
        .insert({
          user_id:      userId,
          name:         name || `Caller ${displayPhone}`,
          primary_phone: displayPhone,
          lead_source:  'voice',
        })
        .select('id')
        .single()

      if (!error && created) customerId = created.id
    }

    if (!customerId) {
      console.error('[voice/ingest] Could not upsert customer for call_sid', call_sid)
      return
    }

    // Location detection + assignment (fire-and-forget, same pattern as main ingest)
    void applyLeadLocationDetection({ customerId, orgId: org_id, supabase })
      .then(() => applyAutoLeadAssignment({ customerId, orgId: org_id, supabase }))
      .catch(() => {})

    const displayPhone = callbackPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
    const activityBody = [
      `Caller: ${name || 'Unknown'}`,
      `Phone: ${displayPhone}`,
      vehicle ? `Vehicle: ${vehicle}` : '',
      timeline ? `Timeline: ${timeline}` : '',
      `Duration: ${duration}s`,
    ].filter(Boolean).join('\n')

    // 2. Create inbound call activity.
    // DB-level dedup protects against any residual race after the row claim.
    const { data: activity } = await supabase
      .from('activities')
      .insert({
        user_id:     userId,
        customer_id: customerId,
        type:        'call',
        direction:   'inbound',
        outcome:     'pending',
        priority:    'high',
        body:        activityBody,
        external_id: call_sid,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    // 2b. Stamp response time — AI agent answering the call = immediate response
    // The DB trigger only fires on outbound activities; stamp directly for inbound voice.
    {
      const { data: cust } = await supabase
        .from('customers')
        .select('created_at, first_response_at')
        .eq('id', customerId)
        .maybeSingle()
      if (cust && !cust.first_response_at) {
        const now      = new Date()
        const secs     = Math.round((now.getTime() - new Date(cust.created_at as string).getTime()) / 1000)
        await supabase
          .from('customers')
          .update({ first_response_at: now.toISOString(), response_time_seconds: secs })
          .eq('id', customerId)
      }
    }

    // 3. Create lead_response task (deduplicates internally)
    await createLeadResponseTask(customerId, name || null, vehicle || null, null, userId)

    // Auto-advance lead state: any completed voice call = at least contacted
    await supabase.rpc('advance_lead_state', {
      p_customer_id: customerId,
      p_new_state:   'contacted',
      p_reason:      'Inbound voice call',
    })

    // Fetch the task that was just created so we can link it
    const { data: task } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_customer_id', customerId)
      .eq('task_type', 'lead_response')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 4. Update voice_calls record
    await supabase
      .from('voice_calls')
      .update({
        customer_id: customerId,
        activity_id: activity?.id ?? null,
        task_id:     task?.id ?? null,
      })
      .eq('call_sid', call_sid)

    // 5. Generate AI summary from VAPI transcript (always run — VAPI structured data is unreliable)
    let finalName    = name
    let finalVehicle = vehicle
    let finalPhone   = callbackPhone

    try {
      const summary = await generateVoiceSummary({
        name,
        vehicle,
        phone:      displayPhone,
        timeline,
        transcript: transcript || activityBody,
      })

      if (summary) {
        await supabase
          .from('voice_calls')
          .update({ summary_json: summary })
          .eq('call_sid', call_sid)

        // Use AI-extracted values if better than what VAPI gave us
        if (summary.caller_name) finalName = summary.caller_name
        if (summary.vehicle_interest) finalVehicle = summary.vehicle_interest
        if (summary.callback_phone) finalPhone = normalizePhone(summary.callback_phone)

        // Update customer name if we extracted a real name and they were created as "Caller XXXX"
        if (summary.caller_name && customerId) {
          await supabase
            .from('customers')
            .update({ name: summary.caller_name })
            .eq('id', customerId)
            .like('name', 'Caller %') // only overwrite auto-generated names
        }

        // Auto-advance to appointment_set if AI detected a specific appointment
        if (summary.appointment_exact && customerId) {
          await supabase.rpc('advance_lead_state', {
            p_customer_id: customerId,
            p_new_state:   'appointment_set',
            p_reason:      `Appointment detected via voice: ${summary.appointment_exact}`,
          })
        }

        // Create callback task when caller gave a range/intent but no exact time
        if (!summary.appointment_exact && summary.appointment_range && customerId) {
          const tomorrow = new Date(new Date().getTime() + 86400000)
          const vehicleNote = summary.vehicle_interest ? ` re: ${summary.vehicle_interest}` : ''
          const callerLabel = summary.caller_name || formatPhone(from)
          await supabase.from('tasks').insert({
            user_id:           userId,
            linked_customer_id: customerId,
            task_type:         'callback',
            title:             `Call back ${callerLabel}${vehicleNote}`,
            priority:          'high',
            status:            'open',
            due_at:            tomorrow.toISOString(),
            notes:             `Requested callback: ${summary.appointment_range}${summary.additional_notes ? ` — ${summary.additional_notes}` : ''}`,
          })
        }

        // Create appointment activity + Google Calendar event if specific time captured
        if (summary.appointment_exact) {
          const vehicleLabel = summary.vehicle_interest ? ` — ${summary.vehicle_interest}` : ''
          const callerLabel  = summary.caller_name || formatPhone(from)
          const locationLabel = summary.location ?? 'TBD'

          // Parse "YYYY-MM-DD HH:mm" → ISO string (treat as PT)
          // Determine correct PT offset: PST (UTC-8) Nov–Mar, PDT (UTC-7) Mar–Nov
          const rawDate = new Date(summary.appointment_exact.replace(' ', 'T'))
          const jan = new Date(rawDate.getFullYear(), 0, 1).getTimezoneOffset()
          const jul = new Date(rawDate.getFullYear(), 6, 1).getTimezoneOffset()
          const isDST = Math.min(jan, jul) === rawDate.getTimezoneOffset()
          const ptOffset = isDST ? '-07:00' : '-08:00'
          const apptDate = new Date(`${summary.appointment_exact.replace(' ', 'T')}:00${ptOffset}`)

          // 1. Activity record → shows on app calendar
          await supabase.from('activities').insert({
            user_id:     userId,
            customer_id: customerId,
            type:        'appointment',
            priority:    'high',
            body:        `${callerLabel}${vehicleLabel} @ ${locationLabel}`,
            due_at:      apptDate.toISOString(),
          })

          // 2. Google Calendar event
          await createCalendarEvent({
            summary:     `Appt: ${callerLabel}${vehicleLabel}`,
            description: [
              `Customer: ${summary.caller_name || 'Unknown'}`,
              `Phone: ${summary.callback_phone || formatPhone(from)}`,
              `Vehicle: ${summary.vehicle_interest || 'Not specified'}`,
              `Location: ${locationLabel}`,
              summary.additional_notes ? `Notes: ${summary.additional_notes}` : '',
            ].filter(Boolean).join('\n'),
            location: summary.location ?? undefined,
            startIso: summary.appointment_exact,
          }, org_id).catch(err => console.error('[calendar] event creation failed:', err))
        }
      }
    } catch (err) {
      console.error('[voice/summarize] Failed:', err)
    }

    // 6. Increment voice usage
    try {
      await supabase.rpc('increment_voice_usage', { p_org_id: org_id, p_seconds: duration })
    } catch {}

    // 7. Push notification
    emitEvent({
      orgId:      org_id,
      eventType:  'call_completed',
      entityType: 'customer',
      entityId:   customerId,
      channel:    'call',
      direction:  'inbound',
      metadata: {
        duration_seconds: duration,
        timeline,
        vehicle: finalVehicle ?? null,
      },
    }).catch(() => {})

    const vehicleLabel  = finalVehicle ? ` — ${finalVehicle}` : ''
    const timelineLabel = timeline     ? ` · ${timeline}`      : ''
    sendLeadNotification({
      title: `Missed call: ${finalName || 'Unknown caller'}${vehicleLabel}`,
      body:  `${displayPhone}${timelineLabel}`,
      url:   `/customers/${customerId}`,
    }, org_id).catch(() => {})

    // 8. Send confirmation SMS to caller (skip if opted out)
    const { data: customerForOptOut } = await supabase
      .from('customers')
      .select('sms_opt_out')
      .eq('id', customerId)
      .single()

    if (!customerForOptOut?.sms_opt_out) {
      const smsTo = finalPhone
        ? (finalPhone.length === 10 ? `+1${finalPhone}` : `+${finalPhone}`)
        : null

      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken  = process.env.TWILIO_AUTH_TOKEN

      // Use org settings + location identity (when a location is already resolved on the customer)
      const [{ data: orgSettings }, { data: customerLocation }] = await Promise.all([
        supabase
          .from('org_settings')
          .select('twilio_phone_number, business_name, owner_name, dealer_cell_number, business_phone, business_address, dealer_website_url')
          .eq('org_id', org_id)
          .maybeSingle(),
        supabase
          .from('customers')
          .select('location_id')
          .eq('id', customerId)
          .maybeSingle(),
      ])

      const locations  = await getOrgActiveLocations(org_id, supabase)
      const identity   = resolveLeadOutboundIdentity({
        customer:    { location_id: customerLocation?.location_id ?? null },
        locations,
        orgSettings: {
          business_name:    orgSettings?.business_name    ?? null,
          business_phone:   orgSettings?.business_phone   ?? orgSettings?.dealer_cell_number ?? null,
          business_address: orgSettings?.business_address ?? null,
          dealer_website_url: orgSettings?.dealer_website_url ?? null,
        },
      })

      const fromNumber =
        orgSettings?.twilio_phone_number ??
        process.env.TWILIO_FROM_NUMBER   ??
        process.env.TWILIO_VOICE_NUMBER

      if (smsTo && accountSid && authToken && fromNumber) {
        try {
          const vehicleMsg = finalVehicle ? ` about the ${finalVehicle}` : ''
          const greeting   = finalName && !finalName.startsWith('Caller') ? `Hi ${finalName.split(' ')[0]}! ` : ''
          const ownerName  = orgSettings?.owner_name ?? 'our team'
          const bizName    = identity.name || 'the dealership'
          const bizPhone   = identity.phone ?? fromNumber ?? ''
          const msgBody    = `${greeting}${ownerName} from ${bizName} will call you back shortly${vehicleMsg}.${bizPhone ? ` - ${bizName} ${bizPhone}` : ''}`

          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method:  'POST',
              headers: {
                Authorization:  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: smsTo, From: fromNumber, Body: msgBody }),
            }
          )
        } catch (smsErr) {
          console.error('[voice/ingest] Confirmation SMS failed:', smsErr)
        }
      }
    } else {
      console.log('[voice/ingest] Skipping confirmation SMS — customer opted out')
    }

    completed = true
  } finally {
    await supabase
      .from('voice_calls')
      .update(
        completed
          ? { processed_at: new Date().toISOString() }
          : { processing_started_at: null }
      )
      .eq('call_sid', call_sid)
  }
}
