/**
 * sendAutoResponseStep1
 *
 * Called inline at the end of ingestLead() (inside the Pub/Sub after() task)
 * to deliver Step 1 of a sequence within seconds of lead arrival.
 *
 * Design:
 *  - Enrolls the customer via enrollCustomer() (handles dupe-enrollment guard)
 *  - Fetches the Step 1 queued activity just created by enrollment
 *  - Sends immediately:  email → sendSequenceEmail  |  sms → Twilio REST
 *  - Marks the activity completed so the daily cron runner skips it
 *  - Never throws — all errors are caught and logged
 *
 * SMS gate: only sends if customer.sms_consent_status === 'opted_in'.
 * New leads have consent pending (sendConsent fires separately in ingestLead).
 * Re-inquiry leads who already opted in will get the SMS immediately.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { enrollCustomer } from '@/lib/sequences/enrollCustomer'
import { checkQuota, incrementUsage } from '@/lib/sms/quota'

interface AutoResponseArgs {
  orgId:      string
  customerId: string
  sequenceId: string
  channel:    'email' | 'sms'
  /** Required when channel = 'email' */
  customerEmail?: string | null
  /** Required when channel = 'sms' */
  customerPhone?: string | null
  customerName:  string
}

export async function sendAutoResponseStep1(args: AutoResponseArgs): Promise<void> {
  const { orgId, customerId, sequenceId, channel, customerEmail, customerPhone, customerName } = args

  try {
    const supabase = createServiceClient()

    // ── 1. Fetch sequence + steps ──────────────────────────────────────────────
    const { data: sequence } = await supabase
      .from('sequences')
      .select('id, name, channel, auto_mode')
      .eq('id', sequenceId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!sequence) {
      console.warn('[autoRespond] sequence not found:', sequenceId)
      return
    }

    if (sequence.channel !== channel) {
      console.warn('[autoRespond] channel mismatch — skipping')
      return
    }

    const { data: stepsRaw } = await supabase
      .from('sequence_steps')
      .select('id, sort_order, day_offset, send_hour, template_id, template:templates(id, name, subject, body)')
      .eq('sequence_id', sequenceId)
      .order('sort_order', { ascending: true })

    const steps = (stepsRaw ?? []) as unknown as Array<{
      id: string
      sort_order: number
      day_offset: number
      send_hour: number
      template_id: string | null
      template: { id: string; name: string; subject: string | null; body: string } | null
    }>

    if (steps.length === 0) {
      console.warn('[autoRespond] sequence has no steps:', sequenceId)
      return
    }

    // ── 2. Fetch customer (need unsubscribe flags + phone + consent status) ────
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms, sms_consent_status')
      .eq('id', customerId)
      .maybeSingle()

    if (!customer) {
      console.warn('[autoRespond] customer not found:', customerId)
      return
    }

    // SMS gate: only send if customer has opted in
    if (channel === 'sms' && customer.sms_consent_status !== 'opted_in') {
      console.log('[autoRespond] SMS skipped — consent not granted yet (status:', customer.sms_consent_status ?? 'null', ')')
      return
    }

    // ── 3. Enroll (handles duplicate guard — skips if already active) ──────────
    const enrollResult = await enrollCustomer({
      supabase,
      orgId,
      customer: {
        id:               customer.id,
        name:             customer.name,
        email:            customer.email,
        primary_phone:    customer.primary_phone,
        unsubscribe_email: customer.unsubscribe_email ?? false,
        unsubscribe_sms:   customer.unsubscribe_sms ?? false,
      },
      sequence,
      steps,
      startAt:          new Date(),
      startImmediately: true,
    })

    if (!enrollResult.ok) {
      if (enrollResult.skipped) {
        console.log('[autoRespond] enrollment skipped:', enrollResult.skip_reason)
      } else {
        console.error('[autoRespond] enrollment failed:', enrollResult.error)
      }
      return
    }

    const enrollmentId = enrollResult.customer_sequence_id!

    // ── 4. Fetch the Step 1 queued activity ────────────────────────────────────
    const { data: step1Activity } = await supabase
      .from('activities')
      .select('id, body')
      .eq('customer_sequence_id', enrollmentId)
      .is('completed_at', null)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!step1Activity) {
      console.error('[autoRespond] step 1 activity not found for enrollment:', enrollmentId)
      return
    }

    // ── 5. Parse body JSON to get subject + body text ─────────────────────────
    let stepBody = ''
    let stepSubject = ''
    let stepLabel = ''
    try {
      const parsed = JSON.parse(step1Activity.body)
      stepBody    = parsed.body ?? ''
      stepSubject = parsed.subject ?? ''
      stepLabel   = parsed.step_label ?? ''
    } catch {
      console.error('[autoRespond] failed to parse step1 activity body')
      return
    }

    // ── 6. Send immediately ───────────────────────────────────────────────────
    if (channel === 'email') {
      const email = customerEmail ?? customer.email
      if (!email) {
        console.warn('[autoRespond] no email address — skipping')
        return
      }

      const { sendSequenceEmail } = await import('@/lib/email/sendSequenceEmail')
      const result = await sendSequenceEmail({
        orgId,
        customerId,
        customerEmail: email,
        customerName,
        subject:    stepSubject,
        body:       stepBody,
        activityId: step1Activity.id,
        sequenceDay: 1,
        stepLabel,
      })

      if (!result.ok) {
        console.error('[autoRespond] email send failed:', result.error)
      } else {
        console.log('[autoRespond] email step 1 sent for customer:', customerId)
      }

    } else {
      // SMS path
      const phone = customerPhone ?? customer.primary_phone
      if (!phone) {
        console.warn('[autoRespond] no phone number — skipping SMS')
        return
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken  = process.env.TWILIO_AUTH_TOKEN

      if (!accountSid || !authToken) {
        console.warn('[autoRespond] Twilio not configured — skipping SMS')
        return
      }

      // Fetch org Twilio number
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('twilio_phone_number, business_name')
        .eq('org_id', orgId)
        .maybeSingle()

      const fromNumber = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER
      if (!fromNumber) {
        console.warn('[autoRespond] no Twilio from number — skipping SMS')
        return
      }

      // Substitute basic vars in SMS body
      const firstName = customerName.split(' ')[0] || customerName
      const msgBody = stepBody
        .replace(/\{first_name\}/gi, firstName)
        .replace(/\{firstName\}/g, firstName)
        .replace(/\{business_name\}/gi, orgSettings?.business_name ?? '')
        .trim()

      // Normalize phone to E.164
      const digits = phone.replace(/\D/g, '')
      const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`

      // Check monthly SMS quota before sending
      const quota = await checkQuota(orgId, false)
      if (!quota.allowed) {
        console.warn('[autoRespond] SMS quota exhausted for org:', orgId, quota.reason)
        return
      }

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: toE164, From: fromNumber, Body: msgBody }),
        }
      )

      if (!twilioRes.ok) {
        const err = await twilioRes.json().catch(() => ({}))
        console.error('[autoRespond] Twilio SMS failed:', err)
        return
      }

      const twilioData = await twilioRes.json()

      // Increment quota counter (fire-and-forget — failure only understates quota)
      incrementUsage(orgId, false).catch(err =>
        console.error('[autoRespond] incrementUsage failed:', err)
      )

      // Mark step 1 activity as sent + log timeline entry
      const nowIso = new Date().toISOString()
      const bodyPrefix = stepLabel ? `[Auto: ${stepLabel}]\n` : ''

      await Promise.all([
        supabase
          .from('activities')
          .update({ completed_at: nowIso, external_id: twilioData.sid ?? null, body: '__sequence_sent__' })
          .eq('id', step1Activity.id),

        supabase.from('activities').insert({
          user_id:      orgId,
          customer_id:  customerId,
          type:         'sms',
          direction:    'outbound',
          body:         `${bodyPrefix}${msgBody}`,
          completed_at: nowIso,
          priority:     'normal',
          external_id:  twilioData.sid ?? null,
        }),

        // Update last_step_sent_at on the enrollment
        supabase
          .from('customer_sequences')
          .update({ last_step_sent_at: nowIso })
          .eq('id', enrollmentId),
      ])

      console.log('[autoRespond] SMS step 1 sent for customer:', customerId)
    }

  } catch (err) {
    // Never throw — a failed auto-response must not block lead ingestion
    console.error('[autoRespond] unexpected error:', err)
  }
}
