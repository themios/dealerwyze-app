import { NextRequest, NextResponse } from 'next/server'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { searchParams } = req.nextUrl
  const status       = searchParams.get('status') ?? 'open'
  const threadType   = searchParams.get('thread_type')
  const assignedTo   = searchParams.get('assigned_to')
  const countOnly    = searchParams.get('count_only') === 'unread'

  const supabase = createServiceClient()

  if (countOnly) {
    const { data: openThreads } = await supabase
      .from('dealer_threads')
      .select('id')
      .eq('status', 'open')
      .neq('org_id', SENTINEL_ORG_ID)

    const threadIds = (openThreads ?? []).map(t => t.id)
    if (!threadIds.length) return NextResponse.json({ count: 0 })

    const { count, error } = await supabase
      .from('dealer_messages')
      .select('id', { count: 'exact', head: true })
      .in('thread_id', threadIds)
      .eq('sender_type', 'dealer')
      .is('read_at', null)

    if (error) return NextResponse.json({ count: 0 })
    return NextResponse.json({ count: count ?? 0 })
  }

  let query = supabase
    .from('dealer_threads')
    .select('id, org_id, subject, thread_type, status, assigned_to, created_at, updated_at, organizations(name)')
    .eq('status', status)
    .neq('org_id', SENTINEL_ORG_ID)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (threadType) query = query.eq('thread_type', threadType)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)

  const { data: threads, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load threads' }, { status: 500 })

  const rows = threads ?? []
  const threadIds = rows.map(t => t.id)
  const profileIds = [
    ...new Set(rows.map(t => t.assigned_to).filter(Boolean) as string[]),
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
      .in('thread_id', threadIds)

    for (const m of messages ?? []) {
      if (!msgByThread[m.thread_id]) msgByThread[m.thread_id] = []
      msgByThread[m.thread_id].push(m)
    }
  }

  const result = rows.map(t => {
    const orgRow = t.organizations as { name?: string } | { name?: string }[] | null
    const orgName = Array.isArray(orgRow) ? orgRow[0]?.name : orgRow?.name
    const msgs = msgByThread[t.id] ?? []
    const last = msgs.length
      ? msgs.reduce((a, b) => (a.sent_at > b.sent_at ? a : b))
      : null
    const unread_count = msgs.filter(
      m => m.sender_type === 'dealer' && m.read_at == null,
    ).length

    return {
      id:              t.id,
      org_id:          t.org_id,
      org_name:        orgName ?? 'Unknown',
      subject:         t.subject,
      thread_type:     t.thread_type,
      status:          t.status,
      assigned_to:     t.assigned_to,
      assigned_name:   t.assigned_to ? nameMap[t.assigned_to] ?? null : null,
      message_count:   msgs.length,
      last_message_at: last?.sent_at ?? null,
      unread_count,
      updated_at:      t.updated_at,
    }
  })

  return NextResponse.json(result)
}
