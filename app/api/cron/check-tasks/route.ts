import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createReceiptReviewTask,
  createInventoryReviewTask,
} from '@/lib/tasks/auto'
import { sendLeadNotification } from '@/lib/push/send'

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

    const firstName = customer.name?.split(' ')[0] || ''
    const greeting  = firstName ? `Hi ${firstName}! ` : ''
    const msgBody   = `${greeting}Reminder: You have an appointment at Apollo Auto tomorrow — ${apptTime}. Call (818) 873-3123 to reschedule. Reply STOP to opt out.`

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

  return NextResponse.json({
    receipts_tasked: receiptsTasked,
    vehicles_tasked: vehiclesTasked,
    dormant_marked: dormantMarked,
    quotas_reset: quotasReset,
    appointment_reminders_sent: remindersent,
    response_alerts: responseAlerts,
  })
}
