import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { UserRole } from '@/types/index'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dealerwyze.com'

// POST — initiate a business ownership transfer
export async function POST(req: Request) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { new_owner_email, notes } = await req.json()
  if (!new_owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_owner_email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  // Service client is required for business_transfers writes: the table has no RLS and requires elevated access.
  // All data snapshot count queries below use the auth client (await createClient()) for org scoping.
  // This split is intentional: business_transfers is a platform-managed table, not user-owned.
  const supabase = createServiceClient()
  const orgId = profile.org_id

  // Block if active transfer already exists for this org
  const { data: existing } = await supabase
    .from('business_transfers')
    .select('id, status')
    .eq('org_id', orgId)
    .in('status', ['pending_claim', 'pending_approval'])
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'An active transfer already exists for this dealership.' },
      { status: 409 }
    )
  }

  // Capture data snapshot
  const userSupabase = await createClient()
  const [customersRes, vehiclesRes, bhphRes, templatesRes] = await Promise.allSettled([
    userSupabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', orgId),
    userSupabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', orgId)
      .eq('status', 'available'),
    userSupabase
      .from('bhph_payments')
      .select('loan_amount, total_paid')
      .eq('user_id', orgId)
      .eq('status', 'active'),
    userSupabase
      .from('templates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', orgId),
  ])

  const bhphRows = bhphRes.status === 'fulfilled' ? (bhphRes.value.data ?? []) : []
  const bhphBalance = bhphRows.reduce(
    (sum, b) => sum + ((b.loan_amount ?? 0) - (b.total_paid ?? 0)),
    0
  )

  const dataSnapshot = {
    customers:    customersRes.status === 'fulfilled' ? (customersRes.value.count ?? 0) : 0,
    vehicles:     vehiclesRes.status === 'fulfilled'  ? (vehiclesRes.value.count ?? 0) : 0,
    bhph_active:  bhphRows.length,
    bhph_balance: Math.round(bhphBalance * 100) / 100,
    templates:    templatesRes.status === 'fulfilled' ? (templatesRes.value.count ?? 0) : 0,
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: transfer, error } = await supabase
    .from('business_transfers')
    .insert({
      org_id:          orgId,
      initiated_by:    profile.id,
      new_owner_email: new_owner_email.toLowerCase().trim(),
      transfer_token:  token,
      token_expires_at: expiresAt,
      notes:           notes || null,
      data_snapshot:   dataSnapshot,
    })
    .select('id')
    .single()

  if (error || !transfer) {
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 })
  }

  return NextResponse.json({
    id:         transfer.id,
    claim_url:  `${APP_URL}/transfer/${token}`,
    expires_at: expiresAt,
  })
}

// DELETE — cancel an active transfer for this org
export async function DELETE() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('business_transfers')
    .update({ status: 'cancelled' })
    .eq('org_id', profile.org_id)
    .in('status', ['pending_claim', 'pending_approval'])

  if (error) {
    return NextResponse.json({ error: 'Failed to cancel transfer' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// GET — fetch active transfer for this org (for settings page state)
export async function GET() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('business_transfers')
    .select('id, new_owner_email, status, transfer_token, token_expires_at, data_snapshot, notes, created_at')
    .eq('org_id', profile.org_id)
    .in('status', ['pending_claim', 'pending_approval'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return NextResponse.json({ transfer: null })

  return NextResponse.json({
    transfer: {
      ...data,
      claim_url: `${APP_URL}/transfer/${data.transfer_token}`,
    },
  })
}
