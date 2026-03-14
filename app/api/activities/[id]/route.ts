import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as { completed_at?: string; outcome?: string; body?: string; snoozed_until?: string }

  const updates: Record<string, unknown> = {}
  if (body.completed_at !== undefined) updates.completed_at = body.completed_at
  if (body.outcome !== undefined) updates.outcome = body.outcome
  if (body.snoozed_until !== undefined) updates.snoozed_until = body.snoozed_until

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
