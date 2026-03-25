/**
 * POST /api/customers/segment
 * Returns customers matching the supplied filter set, scoped to the caller's org.
 * Capped at 200 rows.
 *
 * GET /api/customers/segment?id=<saved_segment_id>
 * Returns the filters for a saved segment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

interface SegmentFilters {
  lead_state?:          string
  source?:              string
  no_reply_days?:       number
  assigned_to_user_id?: string
  tag?:                 string
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { data, error } = await service
    .from('saved_segments')
    .select('id, name, filters, created_at')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ segment: data })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: { filters?: SegmentFilters }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const filters: SegmentFilters = body.filters ?? {}

  // Base query — always scoped to org via user_id
  let query = service
    .from('customers')
    .select('id, name, primary_phone, lead_state, lead_source, created_at')
    .eq('user_id', profile.org_id)
    .or('archived.is.null,archived.eq.false')
    .limit(200)

  // lead_state filter
  const VALID_STATES = ['new', 'contacted', 'appointment_set', 'negotiating', 'sold', 'lost']
  if (filters.lead_state && VALID_STATES.includes(filters.lead_state)) {
    query = query.eq('lead_state', filters.lead_state)
  }

  // source filter
  if (filters.source && typeof filters.source === 'string' && filters.source.trim()) {
    query = query.eq('lead_source', filters.source.trim())
  }

  // assigned_to_user_id filter — verify the target user belongs to this org
  if (filters.assigned_to_user_id && typeof filters.assigned_to_user_id === 'string') {
    const { data: agentCheck } = await service
      .from('profiles')
      .select('id')
      .eq('id', filters.assigned_to_user_id)
      .eq('org_id', profile.org_id)
      .maybeSingle()
    if (agentCheck) {
      query = query.eq('assigned_to_user_id', filters.assigned_to_user_id)
    }
  }

  // tag filter
  if (filters.tag && typeof filters.tag === 'string' && filters.tag.trim()) {
    query = query.contains('tags', [filters.tag.trim()])
  }

  // no_reply_days filter: addressed_at is null OR addressed_at < now() - N days
  const noReplyDays = typeof filters.no_reply_days === 'number' ? Math.floor(filters.no_reply_days) : null
  if (noReplyDays !== null && noReplyDays > 0) {
    const cutoff = new Date(Date.now() - noReplyDays * 86400 * 1000).toISOString()
    query = query.or(`addressed_at.is.null,addressed_at.lt.${cutoff}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to query customers' }, { status: 500 })
  }

  return NextResponse.json({ customers: data ?? [], count: (data ?? []).length })
}
