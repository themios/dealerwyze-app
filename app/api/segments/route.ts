/**
 * GET  /api/segments        — list org's saved segments
 * POST /api/segments        — create a saved segment { name, filters }
 * DELETE /api/segments?id=  — delete a segment by id
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()
  const service = createServiceClient()

  const { data, error } = await service
    .from('saved_segments')
    .select('id, name, filters, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to load segments' }, { status: 500 })
  }

  return NextResponse.json({ segments: data ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: { name?: string; filters?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Name is required (max 100 characters)' }, { status: 400 })
  }

  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {}

  const { data, error } = await service
    .from('saved_segments')
    .insert({ org_id: profile.org_id, name, filters })
    .select('id, name, filters, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to save segment' }, { status: 500 })
  }

  return NextResponse.json({ segment: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Verify ownership before deleting
  const { data: existing } = await service
    .from('saved_segments')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await service
    .from('saved_segments')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete segment' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
