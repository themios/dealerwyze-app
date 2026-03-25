/**
 * POST /api/customers/review-request
 * Triggers a Google review request for a customer.
 * Body: { customer_id: string, force_send?: boolean }
 *
 * Behavior:
 *  - review_request_delay_days = 0  → sends SMS + email immediately
 *  - review_request_delay_days > 0  → creates a review_request task due N days from now
 *    (cron/check-tasks Job 12 picks it up and sends)
 *  - force_send = true              → sends immediately regardless of delay (used by cron)
 *
 * Guards:
 *  - review_request_enabled must be true + google_review_url must be set
 *  - skips if a review_request activity exists in the last 60 days (dedup)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: { customer_id?: unknown; force_send?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : ''
  if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
  const forceSend = body.force_send === true

  // Load org settings
  const { data: settings } = await service
    .from('org_settings')
    .select('business_name, google_review_url, review_request_enabled, review_request_delay_days')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!settings?.review_request_enabled || !settings.google_review_url) {
    return NextResponse.json({ skipped: true, reason: 'not_configured' })
  }

  // Load customer (org-scoped)
  const { data: customer } = await service
    .from('customers')
    .select('id, name, primary_phone, email, unsubscribe_sms, unsubscribe_email, user_id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Dedup: skip if already sent or scheduled in last 60 days
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentActivity } = await service
    .from('activities')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', 'review_request')
    .gte('completed_at', since)
    .maybeSingle()

  if (recentActivity) return NextResponse.json({ skipped: true, reason: 'already_sent' })

  // Also skip if there is already a pending scheduled task
  const { data: pendingTask } = await service
    .from('tasks')
    .select('id')
    .eq('linked_customer_id', customerId)
    .eq('task_type', 'review_request')
    .eq('status', 'open')
    .maybeSingle()

  if (pendingTask && !forceSend) return NextResponse.json({ skipped: true, reason: 'already_scheduled' })

  const delayDays = settings.review_request_delay_days ?? 0

  // --- Delayed send: create a task ---
  if (delayDays > 0 && !forceSend) {
    const dueAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString()
    await service.from('tasks').insert({
      user_id: profile.org_id,
      linked_customer_id: customerId,
      task_type: 'review_request',
      title: `Send Google review request to ${customer.name}`,
      priority: 'normal',
      status: 'open',
      due_at: dueAt,
    })
    return NextResponse.json({ scheduled: true, send_at: dueAt })
  }

  // --- Immediate send ---
  const dealerName = settings.business_name || 'us'
  const reviewUrl  = settings.google_review_url
  const firstName  = customer.name?.split(' ')[0] || 'there'
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? ''

  let smsSent   = false
  let emailSent = false

  if (customer.primary_phone && !customer.unsubscribe_sms) {
    const smsBody = `Hi ${firstName}, thank you for your recent purchase! We would really appreciate if you could share your experience - it helps other customers find us: ${reviewUrl}`
    const smsRes = await fetch(`${appUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customer.primary_phone, body: smsBody, customer_id: customerId, org_id: profile.org_id }),
    })
    if (smsRes.ok) smsSent = true
  }

  if (customer.email && !customer.unsubscribe_email) {
    const emailBody = `Hi ${firstName},\n\nThank you for your recent purchase from ${dealerName}! We hope you are enjoying your vehicle.\n\nIf you have a moment, we would love to hear about your experience. Your review helps other customers find us:\n\n${reviewUrl}\n\nThank you!\n${dealerName}`
    const emailRes = await fetch(`${appUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        org_id: profile.org_id,
        subject: `How was your experience at ${dealerName}?`,
        emailBody,
      }),
    })
    if (emailRes.ok) emailSent = true
  }

  if (smsSent || emailSent) {
    const channels = [smsSent && 'SMS', emailSent && 'email'].filter(Boolean).join(' + ')
    await service.from('activities').insert({
      user_id: customer.user_id,
      customer_id: customerId,
      type: 'review_request',
      direction: 'outbound',
      body: `Google review request sent via ${channels}.`,
      completed_at: new Date().toISOString(),
      priority: 'normal',
    })
    // Close any pending task
    if (pendingTask) {
      await service.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', pendingTask.id)
    }
  }

  return NextResponse.json({ sms_sent: smsSent, email_sent: emailSent })
}
