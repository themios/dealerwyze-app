import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('mechanic_notes')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ mechanic_notes: vehicle.mechanic_notes ?? {} })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  // Merge patch into existing JSONB — only allow known fields
  const allowed = [
    'oil_leaks', 'coolant_leaks', 'shift_quality', 'fluid_condition', 'trans_leaks',
    'front_pads_mm', 'rear_pads_mm', 'smog_ready', 'battery', 'alternator',
    'tech_recommendation', 'engine_codes', 'recommended_work',
    'parts_estimate', 'labor_estimate',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ mechanic_notes: patch })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
