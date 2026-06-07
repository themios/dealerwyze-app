/**
 * GET /api/cron/send-sequences
 *
 * Fires pending email and SMS sequence steps that are due.
 * Runs every 15 minutes via cron-job.org.
 *
 * What it does:
 *  1. Finds all due activities linked to active customer_sequences enrollments
 *  2. For email: delegates to sendSequenceEmail (Gmail OAuth or SMTP)
 *  3. For SMS: sends via Twilio, respects opt-out and TCPA consent, checks quota
 *  4. Marks activities completed, updates last_step_sent_at on the enrollment
 *  5. Marks enrollment completed when all steps are done
 *  6. Pauses sequences where the customer has replied since enrollment
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSequenceEmail } from '@/lib/email/sendSequenceEmail'
import { checkQuota, incrementUsage } from '@/lib/sms/quota'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'
import { getLeadOutboundTemplateVars } from '@/lib/locations/getLeadTemplateVars'
import { orgSmsLimiter } from '@/lib/rateLimit/upstash'

export const runtime     = 'nodejs'
export const maxDuration = 55

// ── Types ────────────────────────────────────────────────────────────────────

interface DueActivity {
  id:                    string
  user_id:               string
  customer_id:           string
  type:                  string
  body:                  string | null
  customer_sequence_id:  string
}

interface ParsedStepBody {
  to?:                string
  subject?:           string
  body?:              string
  step_label?:        string
  customer_name?:     string
  sequence_name?:     string
  sequence_day?:      number
  step_total?:        number
  include_unsubscribe_footer?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

async function sendSequenceSms(opts: {
  supabase:      ReturnType<typeof createServiceClient>
  orgId:         string
  customerId:    string
  toPhone:       string
  body:          string
  activityId:    string
  stepLabel:     string
  sequenceName:  string
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, orgId, customerId, toPhone, body, activityId, stepLabel, sequenceName } = opts

  // TCPA: opt-out and consent checks
  const { data: customer } = await supabase
    .from('customers')
    .select('sms_opt_out, sms_consent_status, name')
    .eq('id', customerId)
    .maybeSingle()

  if (customer?.sms_opt_out) {
    return { ok: false, error: 'sms_opt_out' }
  }
  // Block if consent is explicitly pending (double opt-in not confirmed)
  if (customer?.sms_consent_status === 'pending') {
    return { ok: false, error: 'consent_pending' }
  }

  // Quota check
  const quota = await checkQuota(orgId, false)
  if (!quota.allowed) {
    return { ok: false, error: 'quota_exceeded' }
  }

  // Burst protection: Upstash rate limiter (20 SMS per 5 minutes per org)
  // This is checked BEFORE Twilio call. If rate-limited, we skip and let the next cron run retry.
  const burstLimit = await orgSmsLimiter(orgId)
  if (!burstLimit.allowed) {
    return { ok: false, error: 'rate_limit_exceeded' }
  }

  // Fetch org's Twilio number
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', orgId)
    .maybeSingle()

  const accountSid          = process.env.TWILIO_ACCOUNT_SID
  const authToken           = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const fromNumber          = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken) {
    return { ok: false, error: 'twilio_not_configured' }
  }
  if (!fromNumber && !messagingServiceSid) {
    return { ok: false, error: 'no_from_number' }
  }

  const firstName = (customer?.name ?? '').split(' ')[0] || ''
  const vars = await getLeadOutboundTemplateVars(orgId, customerId, supabase, {
    firstName,
    first_name: firstName,
    vehicle: '',
  })
  const resolvedBody = substituteVars(body, vars)

  // Format destination number to E.164
  const digits      = toPhone.replace(/\D/g, '')
  const formattedTo = digits.length === 10 ? `+1${digits}` : `+${digits}`

  const twilioParams: Record<string, string> = { To: formattedTo, Body: resolvedBody }
  if (messagingServiceSid) twilioParams.MessagingServiceSid = messagingServiceSid
  else twilioParams.From = fromNumber!

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(twilioParams),
    }
  )

  const twilioData = await twilioRes.json() as { sid?: string; message?: string }

  if (!twilioRes.ok) {
    console.error('[send-sequences] Twilio SMS error:', twilioData.message)
    return { ok: false, error: 'twilio_error' }
  }

  const now    = new Date().toISOString()
  const prefix = stepLabel ? `[Auto: ${stepLabel}]\n` : `[Auto: ${sequenceName}]\n`

  // Mark the scheduled activity as completed — clear JSON body so it doesn't show in timeline
  await supabase
    .from('activities')
    .update({ completed_at: now, external_id: twilioData.sid ?? null, body: '__sequence_sent__' })
    .eq('id', activityId)

  // Log a visible sent record in the timeline
  await supabase.from('activities').insert({
    user_id:      orgId,
    customer_id:  customerId,
    type:         'sms',
    direction:    'outbound',
    body:         `${prefix}${resolvedBody}`,
    priority:     'normal',
    external_id:  twilioData.sid ?? null,
    completed_at: now,
  })

  incrementUsage(orgId, false).catch(() => {})

  return { ok: true }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId    = await startCronRun('send-sequences')
  const supabase = createServiceClient()
  const nowIso   = new Date().toISOString()

  let emailSent  = 0
  let smsSent    = 0
  let skipped    = 0
  let errors     = 0

  try {
    // Gate: only process enrollments for active/trialing orgs — avoids Twilio/email spend on canceled orgs
    const { data: activeOrgs } = await supabase
      .from('organizations')
      .select('id')
      .in('subscription_status', ['active', 'trialing'])
    const activeOrgSet = new Set((activeOrgs ?? []).map((o) => o.id))

    // Fetch all due sequence activities across all orgs.
    // Only pick up activities tied to ACTIVE enrollments (joined via customer_sequences).
    const { data: dueActivities, error: fetchError } = await supabase
      .from('activities')
      .select(`
        id,
        user_id,
        customer_id,
        type,
        body,
        customer_sequence_id,
        customer_sequences!inner (
          id,
          status,
          enrolled_at,
          sequence_id,
          channel
        )
      `)
      .in('type', ['email', 'email_followup', 'sms', 'sms_followup'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .lte('due_at', nowIso)
      .eq('customer_sequences.status', 'active')
      .order('due_at', { ascending: true })
      .limit(150)

    if (fetchError) {
      console.error('[send-sequences] fetch error:', fetchError)
      await finishCronRun(runId, 'error', 0, fetchError.message)
      return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
    }

    for (const act of (dueActivities ?? []) as unknown as (DueActivity & {
      customer_sequences: { id: string; status: string; enrolled_at: string; channel: string }
    })[]) {
      const enrollment = act.customer_sequences

      // Guard: only fire for active enrollments
      if (enrollment.status !== 'active') {
        skipped++
        continue
      }

      // Guard: skip if the org is not on an active/trialing subscription
      if (!activeOrgSet.has(act.user_id)) {
        skipped++
        continue
      }

      // Check if customer has replied AFTER enrollment — if so, stop the sequence
      const { data: replies } = await supabase
        .from('activities')
        .select('id')
        .eq('customer_id', act.customer_id)
        .eq('direction', 'inbound')
        .in('type', ['email', 'sms'])
        .gte('created_at', enrollment.enrolled_at)
        .limit(1)

      if (replies && replies.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('name')
          .eq('id', act.customer_id)
          .maybeSingle()
        await stopSequenceOnReply({
          supabase,
          orgId:        act.user_id,
          customerId:   act.customer_id,
          customerName: cData?.name ?? 'Customer',
        })
        skipped++
        continue
      }

      // Parse the JSON body stored at enrollment time
      let parsed: ParsedStepBody = {}
      try {
        parsed = JSON.parse(act.body ?? '')
      } catch {
        errors++
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'failed' })
          .eq('id', act.id)
        continue
      }

      const channel = enrollment.channel

      // ── Email ──────────────────────────────────────────────────────────────
      if (channel === 'email' || act.type === 'email' || act.type === 'email_followup') {
        if (!parsed.to || !parsed.subject || !parsed.body) {
          errors++
          await supabase
            .from('activities')
            .update({ completed_at: nowIso, outcome: 'failed' })
            .eq('id', act.id)
          continue
        }

        const result = await sendSequenceEmail({
          orgId:         act.user_id,
          customerId:    act.customer_id,
          customerEmail: parsed.to,
          customerName:  parsed.customer_name ?? '',
          subject:       parsed.subject,
          body:          parsed.body,
          activityId:    act.id,
          sequenceDay:   parsed.sequence_day ?? 0,
          stepLabel:     parsed.step_label,
        })

        if (result.ok) {
          emailSent++
        } else {
          errors++
          await supabase
            .from('activities')
            .update({ completed_at: nowIso, outcome: result.error === 'no_account' ? 'cancelled' : 'failed' })
            .eq('id', act.id)
          continue
        }
      }

      // ── SMS ────────────────────────────────────────────────────────────────
      else if (channel === 'sms' || act.type === 'sms' || act.type === 'sms_followup') {
        if (!parsed.to || !parsed.body) {
          errors++
          await supabase
            .from('activities')
            .update({ completed_at: nowIso, outcome: 'failed' })
            .eq('id', act.id)
          continue
        }

        const result = await sendSequenceSms({
          supabase,
          orgId:        act.user_id,
          customerId:   act.customer_id,
          toPhone:      parsed.to,
          body:         parsed.body,
          activityId:   act.id,
          stepLabel:    parsed.step_label ?? '',
          sequenceName: parsed.sequence_name ?? 'Autoresponder',
        })

        if (result.ok) {
          smsSent++
        } else if (result.error === 'quota_exceeded' || result.error === 'rate_limit_exceeded') {
          // Leave it pending — will retry next run when quota/rate limit resets
          skipped++
          continue
        } else {
          errors++
          await supabase
            .from('activities')
            .update({
              completed_at: nowIso,
              outcome: ['sms_opt_out', 'consent_pending', 'no_from_number'].includes(result.error ?? '')
                ? 'cancelled'
                : 'failed',
            })
            .eq('id', act.id)
          continue
        }
      }

      // ── Post-send: update enrollment ───────────────────────────────────────
      await supabase
        .from('customer_sequences')
        .update({ last_step_sent_at: nowIso })
        .eq('id', act.customer_sequence_id)

      // Check if this was the last step — if so, mark enrollment completed
      const { count: remaining } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('customer_sequence_id', act.customer_sequence_id)
        .is('completed_at', null)
        .in('type', ['email', 'email_followup', 'sms', 'sms_followup'])

      if ((remaining ?? 0) === 0) {
        await supabase
          .from('customer_sequences')
          .update({ status: 'completed', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
      }
    }
  } catch (e) {
    console.error('[send-sequences] unexpected error:', e)
    await finishCronRun(runId, 'error', 0, String(e))
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const summary = { email_sent: emailSent, sms_sent: smsSent, skipped, errors }
  await finishCronRun(runId, 'success', emailSent + smsSent)
  return NextResponse.json({ ok: true, ...summary })
}
