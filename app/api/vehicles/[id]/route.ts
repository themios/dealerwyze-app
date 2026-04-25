import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const EDITABLE_FIELDS = [
  'stock_no', 'year', 'make', 'model', 'trim', 'color',
  'mileage', 'price', 'vin', 'status', 'notes', 'listing_url', 'body_style',
] as const

type EditableField = typeof EDITABLE_FIELDS[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (!canAccessLedger(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Service client: vehicles use user_id (not org_id) for scoping, which RLS policies do not cover — explicit .eq('user_id') enforces isolation instead.
  const supabase = createServiceClient()

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select('id')
    .single()

  if (error || !vehicle) {
    return NextResponse.json({ error: 'Update failed' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
