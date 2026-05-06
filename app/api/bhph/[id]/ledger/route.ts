/**
 * GET /api/bhph/[id]/ledger — payment ledger rows for a contract (append-only history).
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getProfile, normalizeOwnerRole, type Profile } from '@/lib/auth/profile'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import type { BhphPaymentLedgerEntry } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'

async function requireProfileForBhphApi(): Promise<
  | { profile: Profile; supabase: SupabaseClient }
  | NextResponse
> {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (profile.deactivated_at) {
    await (supabase as SupabaseClient).auth.signOut()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  const effective = staffSession?.orgId
    ? normalizeOwnerRole({ ...profile, org_id: staffSession.orgId })
    : normalizeOwnerRole(profile)
  return { profile: effective, supabase }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireProfileForBhphApi()
  if (auth instanceof NextResponse) return auth

  const { profile, supabase } = auth
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: contractId } = await params

  const { data: contract, error: cErr } = await supabase
    .from('bhph_payments')
    .select('id, user_id')
    .eq('id', contractId)
    .maybeSingle()

  if (cErr || !contract) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (contract.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rows, error: qErr } = await supabase
    .from('bhph_payment_ledger')
    .select('*')
    .eq('bhph_contract_id', contractId)
    .eq('user_id', profile.org_id)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (qErr) {
    console.error('[bhph/ledger] query error:', qErr.message)
    return NextResponse.json({ error: 'Could not load payment history' }, { status: 500 })
  }

  const entries = (rows ?? []) as BhphPaymentLedgerEntry[]

  return NextResponse.json({ entries })
}
