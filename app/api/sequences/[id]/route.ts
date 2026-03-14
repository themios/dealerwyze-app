import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

  const { data: seq, error } = await service
    .from('sequences')
    .select('*')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error || !seq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: steps } = await service
    .from('sequence_steps')
    .select('*, template:templates(id, name, subject, body, channel)')
    .eq('sequence_id', id)
    .order('sort_order', { ascending: true })

  return NextResponse.json({ sequence: seq, steps: steps ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

  const { data: existing } = await service
    .from('sequences')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const allowed: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) allowed.name = body.name.trim()
  if (['manual', 'semi_auto', 'full_auto'].includes(body.auto_mode as string)) {
    allowed.auto_mode = body.auto_mode
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
  }

  const { error } = await service.from('sequences').update(allowed).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

  const { data: existing } = await service
    .from('sequences')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count } = await service
    .from('customer_sequences')
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', id)
    .eq('status', 'active')

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} active enrollment${count === 1 ? '' : 's'}. Cancel them first.` },
      { status: 409 },
    )
  }

  const { error } = await service.from('sequences').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
