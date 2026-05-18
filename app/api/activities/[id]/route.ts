import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'
import { logger } from '@/lib/logger'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    completed_at?: string
    outcome?: string
    body?: string
    snoozed_until?: string
    addressed_at?: string
    due_at?: string
  }

  const updates: Record<string, unknown> = {}
  if (body.completed_at !== undefined) updates.completed_at = body.completed_at
  if (body.outcome !== undefined) updates.outcome = body.outcome
  if (body.snoozed_until !== undefined) updates.snoozed_until = body.snoozed_until
  if (body.addressed_at !== undefined) updates.addressed_at = body.addressed_at
  if (body.due_at !== undefined) updates.due_at = body.due_at

  if (body.body !== undefined) {
    const { data: activity } = await supabase
      .from('activities')
      .select('type, created_by, user_id')
      .eq('id', id)
      .single()
    if (!activity || activity.user_id !== profile.org_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (activity.type !== 'note') {
      return NextResponse.json({ error: 'Only notes can be edited' }, { status: 400 })
    }
    const canEdit = activity.created_by === profile.id || isDealerAdmin(profile.role)
    if (!canEdit) {
      return NextResponse.json({ error: 'Only the note author or an admin can edit this note' }, { status: 403 })
    }
    updates.body = body.body
  }

  const { error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    // Backward compatibility: some envs may not have migration 047_addressed_at applied yet.
    if (
      body.addressed_at !== undefined &&
      !('completed_at' in body) &&
      !('outcome' in body) &&
      !('body' in body) &&
      !('snoozed_until' in body) &&
      /addressed_at/i.test(error.message)
    ) {
      return NextResponse.json({ ok: true, warning: 'addressed_at column missing' })
    }
    logger.error('activities', error, { op: 'patch', id }, profile.org_id)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  // Only allow deleting appointment activities (not SMS/call records)
  const { data: activity } = await supabase
    .from('activities')
    .select('type, user_id')
    .eq('id', id)
    .single()

  if (!activity || activity.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (activity.type !== 'appointment') {
    return NextResponse.json({ error: 'Only appointments can be deleted' }, { status: 400 })
  }

  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    logger.error('activities', error, { op: 'delete', id }, profile.org_id)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
