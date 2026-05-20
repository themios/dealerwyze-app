import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const profile = await requireProfile()
  const { threadId } = await params
  const orgId = profile.org_id
  const supabase = await createClient()

  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('id, subject, thread_type, status, created_at, updated_at')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const now = new Date().toISOString()
  const service = createServiceClient()
  // service role required — dealer_messages has no dealer UPDATE RLS policy; read_at is non-sensitive metadata
  await service
    .from('dealer_messages')
    .update({ read_at: now })
    .eq('org_id', orgId)
    .eq('thread_id', threadId)
    .eq('sender_type', 'platform')
    .is('read_at', null)

  const { data: messages, error } = await supabase
    .from('dealer_messages')
    .select('id, sender_type, channel, body, sent_at, read_at, attachments')
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })

  return NextResponse.json({
    thread: {
      ...thread,
      assigned_to:   null,
      assigned_name: null,
      created_by:    null,
      message_count: messages?.length ?? 0,
      last_message_at: messages?.length
        ? messages[messages.length - 1].sent_at
        : null,
      unread_count: 0,
    },
    messages: (messages ?? []).map(m => ({
      id:                  m.id,
      thread_id:             threadId,
      sender_type:           m.sender_type,
      sender_display_name:   m.sender_type === 'dealer' ? 'You' : 'DealerWyze',
      channel:               m.channel,
      body:                  m.body,
      sent_at:               m.sent_at,
      read_at:               m.read_at,
      attachments:           m.attachments ?? [],
    })),
  })
}
