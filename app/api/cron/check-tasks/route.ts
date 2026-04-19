import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createReceiptReviewTask,
  createInventoryReviewTask,
} from '@/lib/tasks/auto'
import { sendLeadNotification } from '@/lib/push/send'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { sendNotificationEmail } from '@/lib/email/notify'
import { buildNudgeEmailHtml, type NudgeItem } from '@/lib/email/onboarding'
import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'
import { sendAppointmentNotification } from '@/lib/calendar/sendAppointmentNotification'

export const runtime = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  // Accept Vercel native cron (Authorization: Bearer CRON_SECRET)
  // or legacy external cron (x-cron-secret: LEADS_POLL_SECRET)
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('check-tasks')
  const supabase = createServiceClient()
  let receiptsTasked = 0
  let vehiclesTasked = 0

  // ── Job 1: Receipt draft review tasks ────────────────────────────────────
  // Find receipts with status='draft_ready', older than 6 hours,
  // that have no open receipt_review task yet.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  const { data: staleReceipts } = await supabase
    .from('receipts')
    .select('id, vendor_norm, vendor_raw, total, user_id')
    .eq('status', 'draft_ready')
    .lt('created_at', sixHoursAgo)

  for (const receipt of staleReceipts ?? []) {
    // Check whether an open receipt_review task already exists
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_receipt_id', receipt.id)
      .eq('task_type', 'receipt_review')
      .eq('status', 'open')
      .maybeSingle()

    if (existingTask) continue

    await createReceiptReviewTask(
      receipt.id,
      receipt.vendor_norm ?? receipt.vendor_raw,
      receipt.total,
      receipt.user_id
    )
    receiptsTasked++
  }

  // ── Job 2: Inventory aging tasks ─────────────────────────────────────────
  // For each threshold, find vehicles that crossed it today.
  const THRESHOLDS = [21, 30, 45, 60]

  for (const days of THRESHOLDS) {
    // DATE(now) - DATE(created_at) = days
    // We filter: created_at >= start of (today - days) AND < start of (today - days + 1)
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - days)
    const dayStart = new Date(targetDate)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

    const { data: agedVehicles } = await supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, user_id')
      .eq('status', 'available')
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString())

    for (const vehicle of agedVehicles ?? []) {
      // Check whether an open inventory_review task already exists
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_vehicle_id', vehicle.id)
        .eq('task_type', 'inventory_review')
        .eq('status', 'open')
        .maybeSingle()

      if (existingTask) continue

      await createInventoryReviewTask(
        {
          id: vehicle.id,
          stock_no: vehicle.stock_no,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
        },
        days,
        vehicle.user_id
      )
      vehiclesTasked++
    }
  }

  // ── Job 3: Mark dormant customers ─────────────────────────────────────────
  // Customers inactive for 30+ days that aren't already in a terminal/dormant state.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  let dormantMarked = 0

  const { data: activeCandidates } = await supabase
    .from('customers')
    .select('id, last_inbound_at, last_outbound_at, created_at')
    .not('thread_state', 'in', '("sold","lost","dormant")')

  for (const c of activeCandidates ?? []) {
    const lastInbound  = c.last_inbound_at
    const lastOutbound = c.last_outbound_at
    const created      = c.created_at

    // Both timestamps absent: use created_at as proxy
    const lastActivity = lastInbound ?? lastOutbound ?? created

    if (lastActivity && lastActivity < thirtyDaysAgo) {
      await supabase
        .from('customers')
        .update({ thread_state: 'dormant' })
        .eq('id', c.id)
      dormantMarked++
    }
  }

  // ── Job 4: Reset monthly SMS quota for expired billing cycles ─────────────
  const today = new Date().toISOString().slice(0, 10)
  let quotasReset = 0

  const { data: expiredOrgs } = await supabase
    .from('organizations')
    .select('id')
    .lt('billing_cycle_end', today)
    .not('billing_cycle_end', 'is', null)

  for (const org of expiredOrgs ?? []) {
    const cycleStart = today
    const cycleEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    await supabase
      .from('organizations')
      .update({
        monthly_message_count: 0,
        monthly_mms_count: 0,
        monthly_fax_pages: 0,
        sms_overage_count: 0,
        mms_overage_count: 0,
        voice_overage_minutes: 0,
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
      })
      .eq('id', org.id)
    // Also reset voice minutes tracker in org_settings
    await supabase
      .from('org_settings')
      .update({ voice_minutes_month: 0, voice_overage_notified_at: null })
      .eq('org_id', org.id)
    quotasReset++
  }

  // ── Job 5: Appointment reminder SMS (24h before) ──────────────────────────
  // Find appointment activities with due_at in [23h, 25h] from now,
  // reminder_sent_at IS NULL, linked customer not opted out.
  let remindersent = 0

  const reminderWindowStart = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString()
  const reminderWindowEnd   = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()

  const { data: upcomingAppts } = await supabase
    .from('activities')
    .select('id, user_id, customer_id, body, due_at, customers(name, primary_phone, secondary_phone, sms_opt_out)')
    .eq('type', 'appointment')
    .is('reminder_sent_at', null)
    .gte('due_at', reminderWindowStart)
    .lte('due_at', reminderWindowEnd)

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom  = process.env.TWILIO_FROM_NUMBER

  for (const appt of upcomingAppts ?? []) {
    const customer = Array.isArray(appt.customers) ? appt.customers[0] : appt.customers
    if (!customer || customer.sms_opt_out) continue

    const rawPhone = customer.primary_phone || customer.secondary_phone
    if (!rawPhone) continue
    const digits = rawPhone.replace(/\D/g, '')
    const toNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`

    const apptTime = appt.due_at
      ? new Date(appt.due_at).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
          timeZone: 'America/Los_Angeles',
        })
      : 'your upcoming appointment'

    const { data: apptOrgSettings } = await supabase
      .from('org_settings')
      .select('business_name, dealer_cell_number')
      .eq('org_id', appt.user_id)
      .maybeSingle()
    const apptBizName  = apptOrgSettings?.business_name  ?? 'the dealership'
    const apptBizPhone = apptOrgSettings?.dealer_cell_number ?? ''

    const firstName = customer.name?.split(' ')[0] || ''
    const greeting  = firstName ? `Hi ${firstName}! ` : ''
    const reschedule = apptBizPhone ? ` Call ${apptBizPhone} to reschedule.` : ''
    const msgBody   = `${greeting}Reminder: You have an appointment at ${apptBizName} tomorrow — ${apptTime}.${reschedule} Reply STOP to opt out.`

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method:  'POST',
            headers: {
              Authorization:  `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: toNumber, From: twilioFrom, Body: msgBody }),
          }
        )

        await supabase
          .from('activities')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', appt.id)

        remindersent++
      } catch {
        // non-fatal — will retry next cron run
      }
    }
  }

  // ── Job 6: Response-time alerts ───────────────────────────────────────────
  // Alert once per lead if voice lead > 5 min OR email/FB lead > 10 min without first response.
  // Deduped via tasks table — creates a 'response_alert' task so it never fires twice.
  let responseAlerts = 0
  const nowMs          = Date.now()
  const VOICE_LIMIT_MS  = 5  * 60 * 1000  //  5 minutes
  const EMAIL_LIMIT_MS  = 10 * 60 * 1000  // 10 minutes

  const { data: unresponded } = await supabase
    .from('customers')
    .select('id, user_id, name, lead_source, created_at')
    .is('first_response_at', null)
    .not('thread_state', 'in', '("sold","lost","dormant")')
    .not('lead_source', 'is', null)

  for (const c of unresponded ?? []) {
    const ageMs   = nowMs - new Date(c.created_at).getTime()
    const src     = (c.lead_source ?? '').toLowerCase()
    const isVoice = src.includes('voice') || src.includes('call')
    const limitMs = isVoice ? VOICE_LIMIT_MS : EMAIL_LIMIT_MS

    if (ageMs < limitMs) continue

    // Dedup: skip if alert already sent for this customer
    const { data: existingAlert } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_customer_id', c.id)
      .eq('task_type', 'response_alert')
      .maybeSingle()

    if (existingAlert) continue

    const mins = Math.round(ageMs / 60000)
    await sendLeadNotification({
      title: `No response: ${c.name}`,
      body:  `${isVoice ? 'Voice' : 'Email'} lead — ${mins}m without first contact`,
      url:   `/customers/${c.id}`,
    })

    // Create dedup marker task (auto-generated, not shown in user todo list)
    await supabase.from('tasks').insert({
      user_id:           c.user_id,
      linked_customer_id: c.id,
      task_type:         'response_alert',
      title:             `Unresponded ${isVoice ? 'voice' : 'email'} lead: ${c.name}`,
      status:            'open',
      priority:          isVoice ? 'must' : 'high',
      auto_generated:    true,
      source_event:      'response_alert',
    })

    responseAlerts++
  }

  // ── Job 8: Admin health alerts ─────────────────────────────────────────────
  // Idempotent — uses ON CONFLICT DO NOTHING via unique constraint.
  let adminAlerts = 0

  const nowIso  = new Date().toISOString()
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString()
  const fiveDaysAgo   = new Date(Date.now() - 5  * 86400000).toISOString()
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 86400000).toISOString()

  const { data: allOrgs } = await supabase
    .from('organizations')
    .select('id, subscription_status, trial_ends_at, monthly_message_count, sms_quota')
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .not('approved_at', 'is', null)

  for (const org of allOrgs ?? []) {
    const alertsToInsert: { org_id: string; alert_type: string; severity: string }[] = []

    // Trial expiring in ≤3 days — check if they've logged in recently
    if (
      org.subscription_status === 'trialing' &&
      org.trial_ends_at &&
      org.trial_ends_at <= threeDaysFromNow
    ) {
      alertsToInsert.push({ org_id: org.id, alert_type: 'trial_expiring', severity: 'critical' })
    }

    // Past due
    if (org.subscription_status === 'past_due') {
      alertsToInsert.push({ org_id: org.id, alert_type: 'past_due', severity: 'critical' })
    }

    // 2× quota exceeded in a single billing cycle (G22)
    const quota = org.sms_quota ?? 0
    const used  = org.monthly_message_count ?? 0
    if (quota > 0 && used > quota * 2) {
      alertsToInsert.push({ org_id: org.id, alert_type: '2x_quota_exceeded', severity: 'warning' })
    }

    for (const alert of alertsToInsert) {
      const { error } = await supabase
        .from('admin_alerts')
        .insert({ ...alert })
        // unique constraint (org_id, alert_type, resolved_at=null) prevents duplicates
        .select('id')
        .maybeSingle()
      if (!error) {
        adminAlerts++
        if (alert.alert_type === '2x_quota_exceeded') {
          const { fireCogsAlertBackground } = await import('@/lib/cogs/alertWebhook')
          fireCogsAlertBackground({ org_id: org.id, alert_type: '2x_quota_exceeded', severity: alert.severity, created_at: nowIso })
        }
      }
    }
  }

  // No-activity alert: active orgs with no profile login in 21+ days
  // We use profiles.created_at as a proxy since last_sign_in requires auth admin
  const { data: inactiveProfiles } = await supabase
    .from('profiles')
    .select('org_id')
    .lt('created_at', twentyOneDaysAgo)
    .eq('role', 'dealer_admin')

  const inactiveOrgIds = [...new Set((inactiveProfiles ?? []).map(p => p.org_id))]
  for (const orgId of inactiveOrgIds.slice(0, 50)) {
    await supabase
      .from('admin_alerts')
      .insert({ org_id: orgId, alert_type: 'no_activity', severity: 'warning' })
      .select('id')
      .maybeSingle()
  }

  // ── Job 9: Data retention — hard-delete data for orgs canceled 90+ days ago ─
  // Keeps: organizations row (anonymized), admin_audit_log, billing records.
  // Deletes: activities, voice_calls, customers, vehicles, tasks, receipts,
  //          support_ticket_messages, support_tickets.
  let purgedOrgs = 0

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
  const { data: expiredCanceledOrgs } = await supabase
    .from('organizations')
    .select('id')
    .eq('subscription_status', 'canceled')
    .not('canceled_at', 'is', null)
    .lt('canceled_at', ninetyDaysAgo)

  for (const expOrg of expiredCanceledOrgs ?? []) {
    const oid = expOrg.id
    // Delete in dependency order (children first)
    await supabase.from('activities').delete().eq('user_id', oid)
    await supabase.from('voice_calls').delete().eq('user_id', oid)
    await supabase.from('tasks').delete().eq('user_id', oid)
    await supabase.from('receipts').delete().eq('user_id', oid)
    await supabase.from('vehicles').delete().eq('user_id', oid)
    await supabase.from('customers').delete().eq('user_id', oid)
    // Support tickets (support_ticket_messages cascade on delete via FK)
    await supabase.from('support_tickets').delete().eq('org_id', oid)
    // Anonymize org row — keep id + billing fields, clear PII
    await supabase.from('organizations').update({
      name: '[deleted]',
      slug: `deleted-${oid.slice(0, 8)}`,
      updated_at: new Date().toISOString(),
    }).eq('id', oid)
    purgedOrgs++
  }

  // ── Job 10: Onboarding nudge email ─────────────────────────────────────────
  // Send a follow-up nudge to dealers who signed up 4+ hours ago but haven't
  // completed onboarding. Identifies exactly what is incomplete and provides
  // targeted guidance for each item. Sends once per org (deduped via admin_alerts).
  let onboardingNudges = 0

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const { data: pendingOnboarding } = await supabase
    .from('org_settings')
    .select('org_id, business_phone, business_address, zip_code, timezone, voice_business_hours_start, voice_business_hours_end')
    .is('onboarding_completed_at', null)

  for (const row of pendingOnboarding ?? []) {
    const orgId = row.org_id
    if (!orgId) continue

    // Check org was created 4+ hours ago and is approved
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .not('approved_at', 'is', null)
      .lt('created_at', fourHoursAgo)
      .maybeSingle()

    if (!org) continue

    // Check if nudge already sent
    const { data: existing } = await supabase
      .from('admin_alerts')
      .select('id')
      .eq('org_id', orgId)
      .eq('alert_type', 'onboarding_nudge')
      .maybeSingle()

    if (existing) continue

    // Get dealer admin profile + email
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('org_id', orgId)
      .eq('role', 'dealer_admin')
      .maybeSingle()

    if (!adminProfile) continue

    const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
    const email = authUser?.user?.email
    if (!email) continue

    // Check what's actually missing in parallel
    const [vehicleResult, gmailResult] = await Promise.all([
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('user_id', orgId),
      supabase.from('email_accounts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    ])

    const vehicleCount = vehicleResult.count ?? 0
    const gmailCount   = gmailResult.count ?? 0

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
    const incomplete: NudgeItem[] = []

    // Profile fields
    if (!row.business_phone) {
      incomplete.push({
        title:    'Business phone number missing',
        detail:   'Your phone number appears in texts and on your AI voice agent greeting. Customers calling in may hear a generic response without it.',
        action:   'Open the setup wizard and enter your main business phone number on the first step.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Add Phone Number',
      })
    }
    if (!row.business_address || !row.zip_code) {
      incomplete.push({
        title:    'Business address or zip code missing',
        detail:   'Your zip code is used to pull local market pricing data for your inventory. Without it, price comparisons will use national averages instead of your local market.',
        action:   'Open the setup wizard and enter your street address and zip code on the first step.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Add Address',
      })
    }
    if (!row.voice_business_hours_start || !row.voice_business_hours_end) {
      incomplete.push({
        title:    'Business hours not set',
        detail:   'Your AI voice agent uses your business hours to greet callers correctly - open hours vs. after hours messages are different.',
        action:   'Open the setup wizard, scroll to Business Hours on the first step, and set your open and close times.',
        link:     `${appUrl}/onboarding`,
        linkText: 'Set Business Hours',
      })
    }

    // Inventory
    if (vehicleCount === 0) {
      incomplete.push({
        title:    'No vehicles in your inventory',
        detail:   'Without inventory, DealerWyze cannot run market pricing analysis or let customers inquire about specific vehicles.',
        action:   'Go to Inventory and add your first vehicle. You only need the VIN - DealerWyze fills in year, make, and model automatically.',
        link:     `${appUrl}/vehicles/new`,
        linkText: 'Add First Vehicle',
      })
    }

    // Gmail / Lead Inbox
    if (gmailCount === 0) {
      incomplete.push({
        title:    'Lead inbox not connected',
        detail:   'Without a connected Gmail account, leads from CarGurus, AutoTrader, Cars.com, and direct email will not appear in DealerWyze. You could be missing inquiries right now.',
        action:   'Go to Settings and connect your Gmail account. It takes about 30 seconds and you can pick any Google account.',
        link:     `${appUrl}/settings`,
        linkText: 'Connect Gmail',
      })
    }

    void sendNotificationEmail({
      to:      email,
      subject: `Action needed: ${incomplete.length} thing${incomplete.length !== 1 ? 's' : ''} left to finish your DealerWyze setup`,
      html:    buildNudgeEmailHtml(adminProfile.display_name, appUrl, incomplete),
    })

    // Mark as sent
    await supabase.from('admin_alerts').insert({
      org_id:     orgId,
      alert_type: 'onboarding_nudge',
      severity:   'info',
    })

    onboardingNudges++
  }

  // ── Job 11: Auto-send pending email sequence activities ────────────────────
  let sequenceSent = 0
  try {
    const nowIso = new Date().toISOString()

    // Find all due sequence emails not yet sent (all days, not just day 3+)
    const { data: sequenceActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, sequence_day, customer_sequence_id')
      .in('type', ['email', 'email_followup'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .lte('due_at', nowIso)
      .limit(100)

    const { sendSequenceEmail } = await import('@/lib/email/sendSequenceEmail')

    for (const act of sequenceActivities ?? []) {
      // Get enrollment date so we only check replies AFTER the sequence started
      const { data: enrollment } = await supabase
        .from('customer_sequences')
        .select('enrolled_at')
        .eq('id', act.customer_sequence_id)
        .maybeSingle()
      const enrolledAt = enrollment?.enrolled_at ?? '1970-01-01T00:00:00Z'

      // Check if customer has replied AFTER enrollment — if so, cancel pending steps
      const { data: replies } = await supabase
        .from('activities')
        .select('id')
        .eq('customer_id', act.customer_id)
        .eq('direction', 'inbound')
        .in('type', ['email', 'sms'])
        .gte('created_at', enrolledAt)
        .limit(1)

      if (replies && replies.length > 0) {
        // Customer replied — stop autoresponder and create takeover task
        const { data: cData } = await supabase
          .from('customers')
          .select('name, user_id')
          .eq('id', act.customer_id)
          .maybeSingle()
        await stopSequenceOnReply({
          supabase,
          orgId:        act.user_id,
          customerId:   act.customer_id,
          customerName: cData?.name ?? 'Customer',
        })
        continue
      }

      // Parse body JSON
      let parsed: { to?: string; subject?: string; body?: string; step_label?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSequenceEmail({
        orgId:         act.user_id,
        customerId:    act.customer_id,
        customerEmail: parsed.to,
        customerName:  parsed.customer_name ?? '',
        subject:       parsed.subject,
        body:          parsed.body,
        activityId:    act.id,
        sequenceDay:   act.sequence_day ?? 0,
        stepLabel:     parsed.step_label,
      })

      if (result.ok) {
        sequenceSent++
      } else {
        // Mark as failed/cancelled so it doesn't retry on every cron run
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: result.error === 'no_account' ? 'cancelled' : 'failed' })
          .eq('id', act.id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 11 sequence send error:', e)
  }

  // ── Job 12: Auto-fire full_auto sequence steps ─────────────────────────────
  let fullAutoFired = 0
  try {
    const nowIso = new Date().toISOString()
    const { sendSequenceEmail: sendSeqEmail } = await import('@/lib/email/sendSequenceEmail')

    // Fetch due email_followup activities linked to full_auto sequences
    const { data: dueActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, customer_sequence_id')
      .in('type', ['email_followup', 'email'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .lte('due_at', nowIso)
      .not('customer_sequence_id', 'is', null)
      .limit(50)

    for (const act of dueActivities ?? []) {
      if (!act.customer_sequence_id) continue

      // Only fire if the sequence is full_auto and active
      const { data: enrollment } = await supabase
        .from('customer_sequences')
        .select('id, status, org_id, sequence:sequences(auto_mode)')
        .eq('id', act.customer_sequence_id)
        .maybeSingle()

      if (!enrollment || enrollment.status !== 'active') continue
      const seqData = Array.isArray(enrollment.sequence) ? enrollment.sequence[0] : enrollment.sequence
      if ((seqData as { auto_mode?: string } | null)?.auto_mode !== 'full_auto') continue

      // Check unsubscribe
      const { data: cust } = await supabase
        .from('customers')
        .select('unsubscribe_email, email')
        .eq('id', act.customer_id)
        .maybeSingle()

      if (cust?.unsubscribe_email) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'unsubscribed' })
          .eq('id', act.id)
        continue
      }

      // Check for inbound reply since enrollment - cancel all pending if replied
      const { data: reply } = await supabase
        .from('activities')
        .select('id')
        .eq('customer_id', act.customer_id)
        .eq('direction', 'inbound')
        .in('type', ['email', 'sms'])
        .limit(1)
        .maybeSingle()

      if (reply) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('customer_sequence_id', act.customer_sequence_id)
          .is('completed_at', null)
          .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
        await supabase
          .from('customer_sequences')
          .update({ status: 'cancelled', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
        continue
      }

      // Parse body
      let parsed: { to?: string; subject?: string; body?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSeqEmail({
        orgId: enrollment.org_id,
        customerId: act.customer_id,
        customerEmail: parsed.to,
        customerName: parsed.customer_name ?? '',
        subject: parsed.subject,
        body: parsed.body,
        activityId: act.id,
        sequenceDay: 0,
      })

      if (result.ok) {
        fullAutoFired++
      } else if (result.error === 'no_account') {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('id', act.id)
      }

      // Check if this was the last pending step
      const { count: remaining } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('customer_sequence_id', act.customer_sequence_id)
        .is('completed_at', null)
        .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])

      if ((remaining ?? 0) === 0) {
        await supabase
          .from('customer_sequences')
          .update({ status: 'completed', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 12 full_auto sequence error:', e)
  }

  // ── Job 13: Send scheduled Google review requests ─────────────────────────
  let reviewRequestsSent = 0
  try {
    const nowIso = new Date().toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

    const { data: dueTasks } = await supabase
      .from('tasks')
      .select('id, user_id, linked_customer_id')
      .eq('task_type', 'review_request')
      .eq('status', 'open')
      .lte('due_at', nowIso)
      .limit(100)

    for (const task of dueTasks ?? []) {
      if (!task.linked_customer_id || !task.user_id) continue
      try {
        // Get a valid session token for this org by using service client directly
        // We call the review-request API with the org context
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, org_id, role')
          .eq('org_id', task.user_id)
          .eq('role', 'dealer_admin')
          .maybeSingle()

        if (!profile) {
          // Mark task done to avoid retrying endlessly
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        // Load settings and customer directly (avoids HTTP self-call auth complexity)
        const { data: settings } = await supabase
          .from('org_settings')
          .select('business_name, google_review_url, review_request_enabled')
          .eq('org_id', task.user_id)
          .maybeSingle()

        if (!settings?.review_request_enabled || !settings.google_review_url) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const { data: customer } = await supabase
          .from('customers')
          .select('id, name, primary_phone, email, unsubscribe_sms, unsubscribe_email, user_id')
          .eq('id', task.linked_customer_id)
          .eq('user_id', task.user_id)
          .maybeSingle()

        if (!customer) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        // Dedup check
        const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const { data: recent } = await supabase
          .from('activities')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('type', 'review_request')
          .gte('completed_at', since60)
          .maybeSingle()

        if (recent) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const dealerName = settings.business_name || 'your dealership'
        const reviewUrl  = settings.google_review_url
        const firstName  = customer.name?.split(' ')[0] || 'there'

        let smsSent = false, emailSent = false

        if (customer.primary_phone && !customer.unsubscribe_sms) {
          const smsBody = `Hi ${firstName}, thank you for your recent purchase! We would really appreciate if you could share your experience - it helps other customers find us: ${reviewUrl}`
          const smsRes = await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: customer.primary_phone, body: smsBody, customer_id: customer.id, org_id: task.user_id }),
          })
          if (smsRes.ok) smsSent = true
        }

        if (customer.email && !customer.unsubscribe_email) {
          const emailBody = `Hi ${firstName},\n\nThank you for your recent purchase from ${dealerName}! We hope you are enjoying your vehicle.\n\nIf you have a moment, we would love to hear about your experience. Your review helps other customers find us:\n\n${reviewUrl}\n\nThank you!\n${dealerName}`
          const emailRes = await fetch(`${appUrl}/api/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customer.id,
              org_id: task.user_id,
              subject: `How was your experience at ${dealerName}?`,
              emailBody,
            }),
          })
          if (emailRes.ok) emailSent = true
        }

        if (smsSent || emailSent) {
          const channels = [smsSent && 'SMS', emailSent && 'email'].filter(Boolean).join(' + ')
          await supabase.from('activities').insert({
            user_id: customer.user_id,
            customer_id: customer.id,
            type: 'review_request',
            direction: 'outbound',
            body: `Google review request sent via ${channels}.`,
            completed_at: nowIso,
            priority: 'normal',
          })
          reviewRequestsSent++
        }

        await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
      } catch (e) {
        console.error('[check-tasks] Job 13 review request error for task', task.id, e)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 13 review requests error:', e)
  }

  // ── Job 14: Renew expiring Gmail push watches ──────────────────────────────
  // Gmail push watches are valid for ~7 days. Renew any that expire in the
  // next 25 hours so real-time email delivery stays uninterrupted.
  let gmailWatchesRenewed = 0
  let gmailWatchesFailed = 0
  try {
    const { renewExpiredWatches } = await import('@/lib/gmail/watch')
    const watchResult = await renewExpiredWatches()
    gmailWatchesRenewed = watchResult.renewed
    gmailWatchesFailed = watchResult.failed
    if (gmailWatchesRenewed > 0 || gmailWatchesFailed > 0) {
      console.log(`[check-tasks] Job 14 Gmail watches: ${gmailWatchesRenewed} renewed, ${gmailWatchesFailed} failed`)
    }
  } catch (e) {
    console.error('[check-tasks] Job 14 Gmail watch renewal error:', e)
  }

  // ── Job 15: Gmail OAuth token health check ────────────────────────────────
  // Proactively test each Gmail OAuth account daily. On invalid_grant, disable
  // the account and notify the dealer admin so they can reconnect before
  // customers notice a gap in lead syncing.
  let gmailTokensOk = 0
  let gmailTokensRevoked = 0
  try {
    const { google } = await import('googleapis')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

    const { data: gmailAccounts } = await supabase
      .from('email_accounts')
      .select('id, org_id, email, oauth_refresh_token, label')
      .not('oauth_refresh_token', 'is', null)
      .eq('enabled', true)

    for (const acct of gmailAccounts ?? []) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GMAIL_CLIENT_ID,
          process.env.GMAIL_CLIENT_SECRET,
        )
        auth.setCredentials({ refresh_token: acct.oauth_refresh_token })
        await auth.getAccessToken() // throws on invalid_grant
        gmailTokensOk++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('invalid_grant') && !msg.includes('Token has been expired')) continue

        gmailTokensRevoked++
        console.warn(`[check-tasks] Job 15 Gmail token revoked for account ${acct.id} (${acct.email})`)

        // Disable the account so sync doesn't keep failing
        await supabase.from('email_accounts').update({
          enabled:    false,
          last_error: 'Connection expired - please reconnect this account in Settings',
        }).eq('id', acct.id)

        // Dedup alert: only fire once per account per 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: existing } = await supabase
          .from('admin_alerts')
          .select('id')
          .eq('org_id', acct.org_id)
          .eq('alert_type', 'gmail_token_expired')
          .eq('metadata->>account_id', acct.id)
          .gt('created_at', sevenDaysAgo)
          .maybeSingle()
        if (existing) continue

        await supabase.from('admin_alerts').insert({
          org_id:     acct.org_id,
          alert_type: 'gmail_token_expired',
          severity:   'warning',
          metadata:   { account_id: acct.id, email: acct.email },
        })

        // Notify dealer admin by email
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('display_name, email:id')
          .eq('org_id', acct.org_id)
          .eq('role', 'dealer_admin')
          .order('created_at')
          .limit(1)
          .maybeSingle()
        if (adminProfile?.email) {
          // Get actual email from auth.users via service client
          const { data: { users } } = await supabase.auth.admin.listUsers()
          const adminUser = users?.find((u: { id: string }) => u.id === adminProfile.email)
          if (adminUser?.email) {
            void sendNotificationEmail({
              to: adminUser.email,
              subject: 'Action needed: Your email connection needs to be reconnected',
              html: `
                <p>Hi ${adminProfile.display_name ?? 'there'},</p>
                <p>Your <strong>${acct.label || acct.email}</strong> inbox connection has expired and lead syncing has paused for that account.</p>
                <p>This happens periodically and is quick to fix.</p>
                <p><a href="${appUrl}/settings/organization" style="background:#F07018;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0">Reconnect Gmail in Settings</a></p>
                <p>Once reconnected, lead syncing will resume automatically.</p>
                <p>- The DealerWyze Team</p>
              `,
            })
          }
        }
      }
    }
    if (gmailTokensRevoked > 0) {
      console.log(`[check-tasks] Job 15 Gmail tokens: ${gmailTokensOk} ok, ${gmailTokensRevoked} revoked + notified`)
    }
  } catch (e) {
    console.error('[check-tasks] Job 15 Gmail token health check error:', e)
  }

  // ── Job: Appointment reminders (24h before) ──────────────────────────────────
  // Find confirmed appointments due in 18-30 hours that haven't been reminded yet.
  const apptReminderWindowStart = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString()
  const apptReminderWindowEnd   = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString()

  const { data: upcomingAppts2 } = await supabase
    .from('activities')
    .select('id, due_at, body, user_id, customer_id, customer:customers(name, primary_phone, email)')
    .eq('type', 'appointment')
    .is('direction', null)
    .is('completed_at', null)
    .is('appt_reminder_sent_at', null)
    .gte('due_at', apptReminderWindowStart)
    .lte('due_at', apptReminderWindowEnd)
    .limit(100)

  let remindersQueued = 0

  for (const appt of upcomingAppts2 ?? []) {
    const cust = Array.isArray(appt.customer) ? appt.customer[0] : appt.customer
    if (!cust) continue

    const { data: orgSettingsRow } = await supabase
      .from('org_settings')
      .select('business_name')
      .eq('org_id', appt.user_id)
      .maybeSingle()

    await sendAppointmentNotification({
      orgId:          appt.user_id,
      customerId:     appt.customer_id,
      customerName:   (cust as any).name ?? 'Customer',
      customerPhone:  (cust as any).primary_phone ?? '',
      customerEmail:  (cust as any).email ?? '',
      appointmentIso: appt.due_at,
      dealerName:     orgSettingsRow?.business_name ?? 'the dealership',
      calendarUrl:    null,
      type:           'reminder',
    }).catch(err => console.error('[cron/reminders] notification failed:', err))

    await supabase
      .from('activities')
      .update({ appt_reminder_sent_at: new Date().toISOString() })
      .eq('id', appt.id)

    remindersQueued++
  }

  console.log(`[check-tasks] appointment reminders queued: ${remindersQueued}`)

  await finishCronRun(runId, 'success', (allOrgs ?? []).length)

  return NextResponse.json({
    receipts_tasked: receiptsTasked,
    vehicles_tasked: vehiclesTasked,
    dormant_marked: dormantMarked,
    quotas_reset: quotasReset,
    appointment_reminders_sent: remindersent,
    response_alerts: responseAlerts,
    admin_alerts: adminAlerts,
    purged_orgs: purgedOrgs,
    onboarding_nudges: onboardingNudges,
    sequence_sent: sequenceSent,
    full_auto_fired: fullAutoFired,
    review_requests_sent: reviewRequestsSent,
    gmail_watches_renewed: gmailWatchesRenewed,
    gmail_watches_failed: gmailWatchesFailed,
    gmail_tokens_ok: gmailTokensOk,
    gmail_tokens_revoked: gmailTokensRevoked,
    reminders_queued: remindersQueued,
  })
}
