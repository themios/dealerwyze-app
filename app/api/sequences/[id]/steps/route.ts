import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

  const { data: seq } = await service
    .from('sequences')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!seq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: steps } = await service
    .from('sequence_steps')
    .select('*, template:templates(id, name, subject, body)')
    .eq('sequence_id', id)
    .order('sort_order', { ascending: true })

  return NextResponse.json({ steps: steps ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const profile = await requireProfile()
  const { id } = await params
  const service = createServiceClient()

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

  const dayOffset = typeof body.day_offset === 'number' ? body.day_offset : 0
  const sendHour = typeof body.send_hour === 'number' ? body.send_hour : 9
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
  const templateId = typeof body.template_id === 'string' ? body.template_id : null

  if (sendHour < 0 || sendHour > 23) {
    return NextResponse.json({ error: 'send_hour must be 0-23' }, { status: 400 })
  }

  const { data: step, error } = await service
    .from('sequence_steps')
    .insert({ sequence_id: id, sort_order: sortOrder, day_offset: dayOffset, send_hour: sendHour, template_id: templateId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create step' }, { status: 500 })

  return NextResponse.json({ step }, { status: 201 })
}
