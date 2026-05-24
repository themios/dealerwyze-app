import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

const patchThreadSchema = z.object({
  status:      z.enum(['open', 'resolved', 'archived']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
}).refine(
  data => data.status !== undefined || data.assigned_to !== undefined,
  { message: 'At least one field required' },
)

async function loadThreadForOrg(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  threadId: string,
) {
  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('*')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()

  return thread
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId, threadId } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .neq('id', SENTINEL_ORG_ID)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const thread = await loadThreadForOrg(supabase, orgId, threadId)
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const now = new Date().toISOString()
  await supabase
    .from('dealer_messages')
    .update({ read_at: now })
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .eq('sender_type', 'dealer')
    .is('read_at', null)

  const { data: messages, error } = await supabase
    .from('dealer_messages')
    .select('id, sender_type, sender_id, channel, body, subject, sent_at, read_at, attachments')
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })

  const senderIds = [...new Set((messages ?? []).map(m => m.sender_id).filter(Boolean) as string[])]
  const nameMap: Record<string, string> = {}
  if (senderIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', senderIds)
    for (const p of profiles ?? []) nameMap[p.id] = p.display_name ?? 'Unknown'
  }

  const profileIds = [thread.assigned_to, thread.created_by].filter(Boolean) as string[]
  const threadNameMap: Record<string, string> = { ...nameMap }
  const missing = profileIds.filter(id => !threadNameMap[id])
  if (missing.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', missing)
    for (const p of profiles ?? []) threadNameMap[p.id] = p.display_name ?? 'Unknown'
  }

  return NextResponse.json({
    thread: {
      ...thread,
      assigned_to_name: thread.assigned_to ? threadNameMap[thread.assigned_to] ?? null : null,
      created_by_name:  thread.created_by ? threadNameMap[thread.created_by] ?? null : null,
    },
    messages: (messages ?? []).map(m => ({
      ...m,
      sender_display_name: m.sender_id ? nameMap[m.sender_id] ?? null : null,
    })),
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId, threadId } = await params
  const parsed = patchThreadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const existing = await loadThreadForOrg(supabase, orgId, threadId)
  if (!existing) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.assigned_to !== undefined) updates.assigned_to = parsed.data.assigned_to

  const { data: thread, error } = await supabase
    .from('dealer_threads')
    .update(updates)
    .eq('id', threadId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error || !thread) {
    return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'staff',
    action:     'dealer_inbox_thread_update',
    entityType: 'dealer_thread',
    entityId:   threadId,
    metadata:   updates,
  })

  return NextResponse.json(thread)
}
