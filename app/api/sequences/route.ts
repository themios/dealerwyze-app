import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'
import { apiError } from '@/lib/api/errorHandler'

export async function GET() {
  const profile = await requireProfile()
  const service = await createClient()

  const { data: sequences, error } = await service
    .from('sequences')
    .select('*, sequence_steps(count), customer_sequences(count)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })

  if (error) {
    return apiError(error, {
      route: 'GET /api/sequences',
      action: 'fetch_sequences',
      userId: profile.id,
      orgId: profile.org_id,
    })
  }

  return NextResponse.json({ sequences: sequences ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = await createClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, channel, auto_mode } = body as { name?: string; channel?: string; auto_mode?: string }

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!channel || !['sms', 'email'].includes(channel)) {
    return NextResponse.json({ error: 'Channel must be sms or email' }, { status: 400 })
  }
  const validModes = ['manual', 'semi_auto', 'full_auto']
  const mode = validModes.includes(auto_mode ?? '') ? auto_mode : 'manual'

  const { data: seq, error } = await service
    .from('sequences')
    .insert({ org_id: profile.org_id, name: name.trim(), channel, auto_mode: mode })
    .select()
    .single()

  if (error) {
    return apiError(error, {
      route: 'POST /api/sequences',
      action: 'create_sequence',
      userId: profile.id,
      orgId: profile.org_id,
    })
  }

  void writeAuditLog({
    action: 'sequence_created',
    actorType: 'user',
    actorId: profile.id,
    entityType: 'sequence',
    orgId: profile.org_id,
    entityId: seq.id,
    metadata: { channel, auto_mode: mode, name: name.trim() },
  })

  return NextResponse.json({ sequence: seq }, { status: 201 })
}
