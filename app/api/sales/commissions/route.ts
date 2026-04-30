/**
 * GET /api/sales/commissions
 * Returns the channel rep's commission ledger (most recent 100 events).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requireChannelRep, isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  let affiliateCode: string

  const previewCode = req.nextUrl.searchParams.get('code')
  if (previewCode && await isPlatformSuperAdmin(profile.id)) {
    affiliateCode = previewCode
  } else {
    const result = await requireChannelRep(profile.id)
    if (result.denied) return result.denied
    affiliateCode = result.affiliateCode
  }

  const { data: ledger, error } = await supabase
    .from('commission_ledger')
    .select(`
      id, event_type, amount, status,
      billing_period, paid_at, paid_via,
      payment_reference, created_at,
      org_id
    `)
    .eq('affiliate_code', affiliateCode)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with org names
  const orgIds = [...new Set((ledger ?? []).map(r => r.org_id))]
  let orgNames: Record<string, string> = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
    orgNames = Object.fromEntries((orgs ?? []).map(o => [o.id, o.name]))
  }

  const events = (ledger ?? []).map(r => ({
    ...r,
    org_name: orgNames[r.org_id] ?? 'Unknown',
  }))

  return NextResponse.json({ events })
}
