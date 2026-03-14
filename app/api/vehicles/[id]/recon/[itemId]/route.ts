import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger, isDealerAdmin } from '@/lib/auth/dealerRoles'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = await createClient()

  const { data: item } = await supabase
    .from('recon_checklist_items')
    .select('id, is_required, checked')
    .eq('id', itemId)
    .eq('vehicle_id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if ('checked' in body) {
    const checked = Boolean(body.checked)
    patch.checked = checked
    patch.completed_at = checked ? new Date().toISOString() : null
    patch.completed_by = checked ? profile.id : null
  }
  if ('notes' in body) {
    patch.notes = body.notes ? String(body.notes).trim().slice(0, 500) : null
  }
  if ('cost' in body) {
    const n = body.cost != null ? parseFloat(body.cost) : null
    patch.cost = n === null || isNaN(n) ? null : Math.max(0, Math.round(n * 100) / 100)
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { data: updated, error } = await supabase
    .from('recon_checklist_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ item: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role) && profile.role !== 'dealer_manager' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = await createClient()

  const { data: item } = await supabase
    .from('recon_checklist_items')
    .select('id, is_required')
    .eq('id', itemId)
    .eq('vehicle_id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.is_required) {
    return NextResponse.json({ error: 'Required items cannot be deleted. Uncheck it instead.' }, { status: 409 })
  }

  await supabase.from('recon_checklist_items').delete().eq('id', itemId)

  return new NextResponse(null, { status: 204 })
}
