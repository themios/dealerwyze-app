import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const VALID_STATUSES = new Set(['plan','doing','checking','standardized'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id }  = await params
  const body    = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status && VALID_STATUSES.has(body.status))  updates.status      = body.status
  if (body.score_after !== undefined)                   updates.score_after = body.score_after
  if (body.plan_text?.trim())                           updates.plan_text   = body.plan_text.trim()
  if (body.assigned_to !== undefined)                   updates.assigned_to = body.assigned_to
  if (body.due_at !== undefined)                        updates.due_at      = body.due_at

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pulse_actions')
    .update(updates)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}
