import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string; stepId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id, stepId } = await params
  const service = await createClient()

  const { data: seq } = await service
    .from('sequences')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!seq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const allowed: Record<string, unknown> = {}
  if (typeof body.template_id === 'string') allowed.template_id = body.template_id
  if (body.template_id === null) allowed.template_id = null
  if (typeof body.day_offset === 'number') allowed.day_offset = body.day_offset
  if (typeof body.send_hour === 'number') {
    if (body.send_hour < 0 || body.send_hour > 23) {
      return NextResponse.json({ error: 'send_hour must be 0-23' }, { status: 400 })
    }
    allowed.send_hour = body.send_hour
  }
  if (typeof body.sort_order === 'number') allowed.sort_order = body.sort_order

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
  }

  const { error } = await service
    .from('sequence_steps')
    .update(allowed)
    .eq('id', stepId)
    .eq('sequence_id', id)

  if (error) return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id, stepId } = await params
  const service = await createClient()

  const { data: seq } = await service
    .from('sequences')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!seq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await service
    .from('sequence_steps')
    .delete()
    .eq('id', stepId)
    .eq('sequence_id', id)

  if (error) return NextResponse.json({ error: 'Failed to delete step' }, { status: 500 })

  // Re-number remaining steps sequentially
  const { data: remaining } = await service
    .from('sequence_steps')
    .select('id')
    .eq('sequence_id', id)
    .order('sort_order', { ascending: true })

  for (let i = 0; i < (remaining ?? []).length; i++) {
    await service.from('sequence_steps').update({ sort_order: i }).eq('id', remaining![i].id)
  }

  return NextResponse.json({ ok: true })
}
