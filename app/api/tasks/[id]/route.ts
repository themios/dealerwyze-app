import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const UPDATABLE_FIELDS = new Set([
  'title',
  'status',
  'priority',
  'due_at',
  'snooze_until',
  'notes',
  'last_action',
  'linked_vehicle_id',
  'linked_customer_id',
  'linked_receipt_id',
  'assigned_to_user_id',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>

  // Whitelist fields
  const updates: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (UPDATABLE_FIELDS.has(key)) {
      updates[key] = body[key]
    }
  }

  // Always set updated_at
  updates.updated_at = new Date().toISOString()

  // Status transition logic
  if ('status' in updates) {
    if (updates.status === 'done') {
      updates.completed_at = new Date().toISOString()
    } else if (updates.status === 'open') {
      updates.completed_at = null
    }
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select()
    .single()

  if (error) {
    console.error('[tasks/[id] PATCH]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ task })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    console.error('[tasks/[id] DELETE]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
