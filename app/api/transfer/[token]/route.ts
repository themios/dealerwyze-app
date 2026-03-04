import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

// GET — verify token + return data snapshot (public, no auth required)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: transfer } = await supabase
    .from('business_transfers')
    .select(`
      id, org_id, new_owner_email, status, data_snapshot, notes, created_at, token_expires_at,
      initiated_by
    `)
    .eq('transfer_token', token)
    .eq('status', 'pending_claim')
    .gt('token_expires_at', new Date().toISOString())
    .maybeSingle()

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer link not found or expired' }, { status: 404 })
  }

  // Fetch org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', transfer.org_id)
    .single()

  // Fetch initiating owner's name (non-sensitive)
  const { data: initiator } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', transfer.initiated_by)
    .maybeSingle()

  return NextResponse.json({
    id:            transfer.id,
    org_name:      org?.name ?? 'Unknown Dealership',
    initiated_by_name: initiator?.full_name ?? 'Previous Owner',
    data_snapshot: transfer.data_snapshot,
    notes:         transfer.notes,
    expires_at:    transfer.token_expires_at,
  })
}

// POST — claim the transfer (new owner must be authenticated)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data: transfer } = await supabase
    .from('business_transfers')
    .select('id, org_id, initiated_by, token_expires_at, status')
    .eq('transfer_token', token)
    .eq('status', 'pending_claim')
    .gt('token_expires_at', new Date().toISOString())
    .maybeSingle()

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer link not found or expired' }, { status: 404 })
  }

  if (transfer.initiated_by === profile.id) {
    return NextResponse.json(
      { error: 'You cannot claim a transfer you initiated.' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('business_transfers')
    .update({
      new_owner_user_id: profile.id,
      status: 'pending_approval',
    })
    .eq('id', transfer.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to claim transfer' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
