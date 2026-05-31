/*
 * Resend inbound email webhook (signed header auth).
 *
 * Setup (one-time, done in Resend dashboard):
 * 1. Add reply.dealerwyze.com as an inbound domain (add MX records to DNS)
 * 2. Create routing rule: *@reply.dealerwyze.com →
 *    POST https://app.dealerwyze.com/api/webhooks/dealer-reply
 * 3. Note the signing secret Resend displays (store as RESEND_INBOUND_SECRET)
 * 4. Set RESEND_INBOUND_SECRET and RESEND_REPLY_DOMAIN in environment variables.
 *
 * Auth: Validates HMAC-SHA256(rawBody, RESEND_INBOUND_SECRET) against x-resend-signature header.
 * Includes 5-minute timestamp replay protection via x-resend-timestamp header.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getDealerSignupEmail } from '@/lib/admin/dealerSignupEmail'
import { sendNotificationEmail } from '@/lib/email/notify'
import { writeAuditLog } from '@/lib/audit/log'

export const runtime = 'nodejs'

interface ResendInboundPayload {
  from:    string
  to:      string[]
  subject: string
  text:    string | null
  html:    string | null
  headers: { name: string; value: string }[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate Resend signature: HMAC-SHA256(rawBody, secret) as hex.
 * Includes 5-minute replay protection via timestamp header.
 */
function validateResendSignature(
  secret: string,
  rawBody: string,
  sigHeader: string,
  timestampHeader: string
): boolean {
  // Parse signature header (format: "t=<timestamp>,v1=<signature>")
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => {
      const idx = p.indexOf('=')
      return idx === -1 ? [p, ''] : [p.slice(0, idx), p.slice(idx + 1)]
    })
  )
  const ts = parts['t'] ?? timestampHeader
  const sig = parts['v1'] ?? parts['signature']

  if (!ts || !sig) return false

  // Reject timestamps older than 5 minutes
  const tsMs = Number(ts)
  if (!Number.isFinite(tsMs)) return false
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false

  // Compute HMAC-SHA256 over rawBody
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim().toLowerCase()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_INBOUND_SECRET ?? ''
  if (!secret) {
    console.error('[dealer-reply] RESEND_INBOUND_SECRET not configured')
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 })
  }

  // Read raw body for signature validation
  const rawBody = await req.text()

  // Validate signed header + timestamp replay protection
  const sigHeader = req.headers.get('x-resend-signature') ?? ''
  const tsHeader = req.headers.get('x-resend-timestamp') ?? ''
  if (!validateResendSignature(secret, rawBody, sigHeader, tsHeader)) {
    // Log signature failure for security monitoring
    void writeAuditLog({
      orgId:      null,
      actorId:    null,
      actorType:  'staff',
      action:     'webhook_auth_failure',
      entityType: 'webhook',
      entityId:   'dealer-reply',
      metadata:   {
        path:   '/api/webhooks/dealer-reply',
        reason: 'invalid_signature',
        ip:     req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      },
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: ResendInboundPayload | null
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload
  } catch {
    payload = null
  }
  if (!payload?.from || !Array.isArray(payload.to) || !payload.to.length) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  let threadId: string | null = null
  for (const addr of payload.to) {
    const match = addr.match(/reply\+([^@]+)@/)
    if (match && UUID_RE.test(match[1])) {
      threadId = match[1]
      break
    }
  }
  if (!threadId) {
    return NextResponse.json({ error: 'No thread ID found' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('id, org_id, subject, assigned_to, status')
    .eq('id', threadId)
    .maybeSingle()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  if (thread.status === 'archived') {
    return NextResponse.json({ ok: true })
  }

  const senderEmail = extractEmail(payload.from)
  const dealerEmail = await getDealerSignupEmail(supabase, thread.org_id)

  if (!dealerEmail || senderEmail !== dealerEmail.toLowerCase()) {
    void writeAuditLog({
      orgId:      thread.org_id,
      actorId:    null,
      actorType:  'staff',
      action:     'dealer_inbox_spoofed_reply',
      entityType: 'dealer_thread',
      entityId:   thread.id,
      metadata:   { from: senderEmail, expected: dealerEmail ?? 'unknown' },
    })
    return NextResponse.json({ ok: true })
  }

  const messageIdHeader = payload.headers?.find(
    h => h.name.toLowerCase() === 'message-id',
  )?.value ?? null

  if (messageIdHeader) {
    const { data: existing } = await supabase
      .from('dealer_messages')
      .select('id')
      .eq('resend_id', messageIdHeader)
      .maybeSingle()
    if (existing) return NextResponse.json({ ok: true })
  }

  const body = (payload.text ?? '').trim().slice(0, 10000)
  if (!body) return NextResponse.json({ error: 'Empty body' }, { status: 400 })

  const { data: message, error } = await supabase
    .from('dealer_messages')
    .insert({
      thread_id:   thread.id,
      org_id:      thread.org_id,
      sender_type: 'dealer',
      sender_id:   null,
      channel:     'email',
      body,
      resend_id:   messageIdHeader,
    })
    .select('id')
    .single()

  if (error || !message) {
    return NextResponse.json({ error: 'Failed to store reply' }, { status: 500 })
  }

  let notifyEmail = process.env.PLATFORM_OWNER_EMAIL ?? null

  if (thread.assigned_to) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(thread.assigned_to)
      if (authUser?.user?.email) notifyEmail = authUser.user.email
    } catch { /* fall back to platform owner */ }
  }

  if (notifyEmail) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', thread.org_id)
      .maybeSingle()

    const orgName = org?.name ?? 'A dealer'
    const safeBody = escapeHtml(body).replace(/\n/g, '<br />')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.dealerwyze.com'

    void sendNotificationEmail({
      to:         notifyEmail,
      subject:    `New reply: ${thread.subject}`,
      html:       `<p><strong>${escapeHtml(orgName)}</strong> replied to thread: <em>${escapeHtml(thread.subject)}</em></p>
                 <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;">${safeBody}</blockquote>
                 <p><a href="${appUrl}/admin/orgs/${thread.org_id}">View in DealerWyze</a></p>`,
      email_type: 'dealer_inbox_reply_notify',
    })
  }

  void writeAuditLog({
    orgId:      thread.org_id,
    actorId:    null,
    actorType:  'staff',
    action:     'dealer_inbox_reply_received',
    entityType: 'dealer_message',
    entityId:   message.id,
    metadata:   { thread_id: thread.id, channel: 'email' },
  })

  return NextResponse.json({ ok: true })
}
