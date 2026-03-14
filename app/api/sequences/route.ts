import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()
  const service = createServiceClient()

  const { data: sequences, error } = await service
    .from('sequences')
    .select('*, sequence_steps(count), customer_sequences(count)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 })

  return NextResponse.json({ sequences: sequences ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

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

  if (error) return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 })

  return NextResponse.json({ sequence: seq }, { status: 201 })
}
