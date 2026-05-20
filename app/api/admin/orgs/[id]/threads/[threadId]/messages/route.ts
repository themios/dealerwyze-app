import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'
import { sendNotificationEmail } from '@/lib/email/notify'
import { getDealerSignupEmail } from '@/lib/admin/dealerSignupEmail'

const postMessageSchema = z.object({
  body:    z.string().trim().min(1).max(10000),
  channel: z.enum(['email', 'note', 'call_log']),
  subject: z.string().trim().max(500).optional(),
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMessageEmailHtml(body: string): string {
  const safe = escapeHtml(body).replace(/\n/g, '<br />')
  return `<div style="font-family: sans-serif; line-height: 1.5; color: #111;">
<p>${safe}</p>
<p style="color: #666; font-size: 13px;">— DealerWyze Success Team</p>
</div>`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { id: orgId, threadId } = await params
  const parsed = postMessageSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('id, org_id, subject')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const { body, channel, subject: messageSubject } = parsed.data
  let resendId: string | undefined

  if (channel === 'email') {
    const dealerEmail = await getDealerSignupEmail(supabase, orgId)
    if (!dealerEmail) {
      return NextResponse.json({ error: 'Dealer email not found' }, { status: 400 })
    }

    const emailSubject = messageSubject?.trim() || thread.subject
    const replyDomain = process.env.RESEND_REPLY_DOMAIN
    const { resendId: sentId } = await sendNotificationEmail({
      to:         dealerEmail,
      subject:    emailSubject,
      html:       buildMessageEmailHtml(body),
      org_id:     orgId,
      email_type: 'dealer_inbox',
      ...(replyDomain ? { reply_to: `reply+${threadId}@${replyDomain}` } : {}),
    })
    resendId = sentId
  }

  const { data: message, error } = await supabase
    .from('dealer_messages')
    .insert({
      thread_id:   threadId,
      org_id:      orgId,
      sender_type: 'platform',
      sender_id:   profile.id,
      channel,
      subject:     messageSubject ?? (channel === 'email' ? thread.subject : null),
      body,
      resend_id:   resendId ?? null,
    })
    .select('id')
    .single()

  if (error || !message) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'staff',
    action:     'dealer_inbox_message_send',
    entityType: 'dealer_message',
    entityId:   message.id,
    metadata:   { thread_id: threadId, channel },
  })

  return NextResponse.json({ ok: true, message_id: message.id })
}
