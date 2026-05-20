import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { writeAuditLog } from '@/lib/audit/log'

const attachmentSchema = z.object({
  name: z.string().max(500),
  path: z.string().max(2000),
  size: z.number().int().nonnegative(),
  type: z.string().max(200),
})

const bodySchema = z.object({
  body:        z.string().trim().max(5000).default(''),
  channel:     z.enum(['in_app', 'email']).default('in_app'),
  attachments: z.array(attachmentSchema).max(20).optional(),
}).refine(d => d.body.length > 0 || (d.attachments?.length ?? 0) > 0, {
  message: 'Message body or at least one attachment is required',
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const profile = await requireProfile()
  const { threadId } = await params
  const orgId = profile.org_id

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { body, channel, attachments = [] } = parsed.data

  const supabase = await createClient()
  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('id, subject, assigned_to')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const { data: message, error } = await supabase
    .from('dealer_messages')
    .insert({
      thread_id:   threadId,
      org_id:      orgId,
      sender_type: 'dealer',
      sender_id:   profile.id,
      channel,
      body,
      attachments: attachments.length > 0 ? attachments : [],
    })
    .select('id')
    .single()

  if (error || !message) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'user',
    action:     'dealer_inbox_dealer_reply',
    entityType: 'dealer_message',
    entityId:   message.id,
    metadata:   { thread_id: threadId, channel },
  })

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  let notifyEmail = process.env.PLATFORM_OWNER_EMAIL ?? null

  if (thread.assigned_to) {
    try {
      // service role required — auth.admin.getUserById has no RLS equivalent
      const { data: authUser } = await service.auth.admin.getUserById(thread.assigned_to)
      if (authUser?.user?.email) notifyEmail = authUser.user.email
    } catch { /* fall back to platform owner */ }
  }

  if (notifyEmail) {
    const orgName = org?.name ?? 'Dealer'
    const safeBody = parsed.data.body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.dealerwyze.com'

    void sendNotificationEmail({
      to:         notifyEmail,
      subject:    `Dealer reply: ${thread.subject}`,
      html:       `<p><strong>${orgName}</strong> replied in Dealer Success Inbox:</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;">${safeBody}</blockquote>
        <p><a href="${appUrl}/admin/orgs/${orgId}">View in DealerWyze</a></p>`,
      org_id:     orgId,
      email_type: 'dealer_inbox_dealer_reply_notify',
    })
  }

  return NextResponse.json({ ok: true, message_id: message.id })
}
