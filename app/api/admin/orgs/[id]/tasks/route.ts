import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

const createTaskSchema = z.object({
  title:       z.string().trim().min(1).max(500),
  notes:       z.string().trim().max(5000).optional(),
  due_at:      z.string().datetime().optional(),
  assigned_to: z.string().uuid().optional(),
  thread_id:   z.string().uuid().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
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

  const { data: tasks, error } = await supabase
    .from('dealer_tasks')
    .select('*')
    .eq('org_id', orgId)
    .order('due_at', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 })

  const assigneeIds = [...new Set((tasks ?? []).map(t => t.assigned_to).filter(Boolean) as string[])]
  const threadIds   = [...new Set((tasks ?? []).map(t => t.thread_id).filter(Boolean) as string[])]

  const nameMap: Record<string, string> = {}
  if (assigneeIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', assigneeIds)
    for (const p of profiles ?? []) nameMap[p.id] = p.display_name ?? 'Unknown'
  }

  const subjectMap: Record<string, string> = {}
  if (threadIds.length) {
    const { data: threads } = await supabase
      .from('dealer_threads')
      .select('id, subject')
      .eq('org_id', orgId)
      .in('id', threadIds)
    for (const t of threads ?? []) subjectMap[t.id] = t.subject
  }

  const result = (tasks ?? []).map(t => ({
    ...t,
    assigned_to_name: t.assigned_to ? nameMap[t.assigned_to] ?? null : null,
    thread_subject:   t.thread_id ? subjectMap[t.thread_id] ?? null : null,
  }))

  return NextResponse.json(result)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { id: orgId } = await params
  const parsed = createTaskSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .neq('id', SENTINEL_ORG_ID)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { title, notes, due_at, assigned_to, thread_id } = parsed.data

  if (thread_id) {
    const { data: thread } = await supabase
      .from('dealer_threads')
      .select('id')
      .eq('id', thread_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const { data: task, error } = await supabase
    .from('dealer_tasks')
    .insert({
      org_id:      orgId,
      title,
      notes:       notes ?? null,
      due_at:      due_at ?? null,
      assigned_to: assigned_to ?? null,
      thread_id:   thread_id ?? null,
      created_by:  profile.id,
    })
    .select()
    .single()

  if (error || !task) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'staff',
    action:     'dealer_inbox_task_create',
    entityType: 'dealer_task',
    entityId:   task.id,
    metadata:   { title },
  })

  return NextResponse.json(task)
}
