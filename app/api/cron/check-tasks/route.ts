import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createReceiptReviewTask,
  createInventoryReviewTask,
} from '@/lib/tasks/auto'
import { sendLeadNotification } from '@/lib/push/send'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

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
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
      })
      .eq('id', org.id)
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
    .select('id, subscription_status, trial_ends_at')
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

    for (const alert of alertsToInsert) {
      const { error } = await supabase
        .from('admin_alerts')
        .insert({ ...alert })
        // unique constraint (org_id, alert_type, resolved_at=null) prevents duplicates
        .select('id')
        .maybeSingle()
      if (!error) adminAlerts++
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

  await finishCronRun(runId, 'success', (allOrgs ?? []).length)

  return NextResponse.json({
    receipts_tasked: receiptsTasked,
    vehicles_tasked: vehiclesTasked,
    dormant_marked: dormantMarked,
    quotas_reset: quotasReset,
    appointment_reminders_sent: remindersent,
    response_alerts: responseAlerts,
    admin_alerts: adminAlerts,
  })
}
