import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const patchTaskSchema = z.object({
  title:         z.string().trim().min(1).max(500).optional(),
  notes:         z.string().trim().max(5000).nullable().optional(),
  due_at:        z.string().datetime().nullable().optional(),
  assigned_to:   z.string().uuid().nullable().optional(),
  completed_at:  z.string().datetime().nullable().optional(),
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field required' },
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId, taskId } = await params
  const parsed = patchTaskSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('dealer_tasks')
    .select('id, org_id')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const updates: Record<string, unknown> = { ...parsed.data }

  const { data: task, error } = await supabase
    .from('dealer_tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error || !task) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }

  void writeAuditLog({
    orgId,
    actorId:    profile.id,
    actorType:  'staff',
    action:     'dealer_inbox_task_update',
    entityType: 'dealer_task',
    entityId:   taskId,
    metadata:   updates,
  })

  return NextResponse.json(task)
}
