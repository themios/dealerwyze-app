import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

const createThreadSchema = z.object({
  subject:     z.string().trim().min(1).max(500),
  thread_type: z.enum(['success', 'support', 'billing', 'sales']),
  assigned_to: z.string().uuid().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .neq('id', SENTINEL_ORG_ID)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { data: threads, error } = await supabase
    .from('dealer_threads')
    .select('id, subject, thread_type, status, assigned_to, created_by, created_at, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load threads' }, { status: 500 })

  const threadIds = (threads ?? []).map(t => t.id)
  const profileIds = [
    ...new Set(
      (threads ?? []).flatMap(t => [t.assigned_to, t.created_by].filter(Boolean) as string[]),
    ),
  ]

  const nameMap: Record<string, string> = {}
  if (profileIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', profileIds)
    for (const p of profiles ?? []) nameMap[p.id] = p.display_name ?? 'Unknown'
  }

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
      m => m.sender_type === 'dealer' && m.read_at == null,
    ).length

    return {
      id:               t.id,
      subject:          t.subject,
      thread_type:      t.thread_type,
      status:           t.status,
      assigned_to:      t.assigned_to,
      assigned_name: t.assigned_to ? nameMap[t.assigned_to] ?? null : null,
      created_by:       t.created_by,
      created_by_name:  t.created_by ? nameMap[t.created_by] ?? null : null,
      created_at:       t.created_at,
      updated_at:       t.updated_at,
      message_count:    msgs.length,
      last_message_at:  last?.sent_at ?? null,
      unread_count,
    }
  })

  return NextResponse.json(result)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId } = await params
  const parsed = createThreadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .neq('id', SENTINEL_ORG_ID)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { subject, thread_type, assigned_to } = parsed.data

  const { data: thread, error } = await supabase
    .from('dealer_threads')
    .insert({
      org_id:      orgId,
      subject,
      thread_type,
      assigned_to: assigned_to ?? null,
      created_by:  profile.id,
    })
    .select()
    .single()

  if (error || !thread) {
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'staff',
    action:     'dealer_inbox_thread_create',
    entityType: 'dealer_thread',
    entityId:   thread.id,
    metadata:   { subject, thread_type },
  })

  return NextResponse.json(thread)
}
