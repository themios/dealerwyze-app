import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  const { data: threads, error } = await supabase
    .from('dealer_threads')
    .select('id, subject, thread_type, status, created_at, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Failed to load threads' }, { status: 500 })

  const threadIds = (threads ?? []).map(t => t.id)

  type MsgRow = { thread_id: string; sent_at: string; sender_type: string; read_at: string | null }
  const msgByThread: Record<string, MsgRow[]> = {}
  if (threadIds.length) {
    const { data: messages } = await supabase
      .from('dealer_messages')
      .select('thread_id, sent_at, sender_type, read_at')
      .eq('org_id', orgId)
      .in('thread_id', threadIds)

    for (const m of messages ?? []) {
      if (!msgByThread[m.thread_id]) msgByThread[m.thread_id] = []
      msgByThread[m.thread_id].push(m)
    }
  }

  const result = (threads ?? []).map(t => {
    const msgs = msgByThread[t.id] ?? []
    const last = msgs.length
      ? msgs.reduce((a, b) => (a.sent_at > b.sent_at ? a : b))
      : null
    const unread_count = msgs.filter(
      m => m.sender_type === 'platform' && m.read_at == null,
    ).length

    return {
      id:              t.id,
      subject:         t.subject,
      thread_type:     t.thread_type,
      status:          t.status,
      assigned_to:     null,
      assigned_name:   null,
      created_by:      null,
      created_at:      t.created_at,
      updated_at:      t.updated_at,
      message_count:   msgs.length,
      last_message_at: last?.sent_at ?? null,
      unread_count,
    }
  })

  return NextResponse.json(result)
}
