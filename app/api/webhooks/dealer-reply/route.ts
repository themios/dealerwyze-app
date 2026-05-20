/*
 * Resend inbound setup (one-time, done in Resend dashboard):
 * 1. Add reply.dealerwyze.com as an inbound domain (add MX records to DNS)
 * 2. Create routing rule: *@reply.dealerwyze.com →
 *    POST https://app.dealerwyze.com/api/webhooks/dealer-reply?secret={RESEND_INBOUND_SECRET}
 * 3. Set RESEND_INBOUND_SECRET and RESEND_REPLY_DOMAIN in environment variables.
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

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
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
  const incoming = req.nextUrl.searchParams.get('secret') ?? ''
  if (!safeEqual(secret, incoming)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 400 })
  }

  let payload: ResendInboundPayload | null
  try {
    payload = await req.json() as ResendInboundPayload
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
