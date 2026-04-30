import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const EDITABLE_FIELDS = [
  'stock_no', 'year', 'make', 'model', 'trim', 'color',
  'mileage', 'price', 'vin', 'status', 'notes', 'listing_url', 'body_style',
] as const

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

  if (typeof patch.vin === 'string') {
    const cleanVin = patch.vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase()
    patch.vin = cleanVin || null
    if (cleanVin.length >= 6) {
      patch.stock_no = cleanVin.slice(-6)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = await createClient()

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
