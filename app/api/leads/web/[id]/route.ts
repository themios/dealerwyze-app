import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

interface Params { params: Promise<{ id: string }> }

const VALID_STATUSES = ['new', 'imported', 'archived'] as const
const UuidSchema = z.string().uuid()

const PatchSchema = z.object({
  status: z.enum(VALID_STATUSES),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'status must be one of: new, imported, archived' }, { status: 422 })
  }

  // createClient() is correct here: requireProfile() is in scope and migration 134
  // added UPDATE/DELETE RLS policies (org_can_update_inquiries / org_can_delete_inquiries)
  // that scope via get_org_id(). Explicit .eq('org_id') is a belt-and-suspenders guard.
  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_inquiries')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[leads/web PATCH] db error:', error.message)
    return NextResponse.json({ error: 'Could not update inquiry' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: parsed.data.status })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_inquiries')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[leads/web DELETE] db error:', error.message)
    return NextResponse.json({ error: 'Could not delete inquiry' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
