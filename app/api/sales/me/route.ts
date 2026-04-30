/**
 * GET /api/sales/me
 * Returns the channel rep's profile + affiliate code details.
 * Platform super admins may pass ?code=AFF-XXXX to preview a rep's data.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requireChannelRep, isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  let affiliateCode: string

  // Super admins can preview any rep via ?code=
  const previewCode = req.nextUrl.searchParams.get('code')
  if (previewCode && await isPlatformSuperAdmin(profile.id)) {
    affiliateCode = previewCode
  } else {
    const result = await requireChannelRep(profile.id)
    if (result.denied) return result.denied
    affiliateCode = result.affiliateCode
  }

  const { data: aff, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .eq('code', affiliateCode)
    .single()

  if (error || !aff) {
    return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })
  }

  // Commission totals
  const { data: ledger } = await supabase
    .from('commission_ledger')
    .select('amount, status')
    .eq('affiliate_code', affiliateCode)

  const pendingBalance = (ledger ?? [])
    .filter(r => r.status === 'pending')
    .reduce((s, r) => s + Number(r.amount), 0)
  const allTimePaid = (ledger ?? [])
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + Number(r.amount), 0)

  // Active dealer count
  const { count: activeDealers } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_code', affiliateCode)
    .eq('subscription_status', 'active')

  return NextResponse.json({
    affiliate: aff,
    stats: {
      pending_balance:  parseFloat(pendingBalance.toFixed(2)),
      all_time_paid:    parseFloat(allTimePaid.toFixed(2)),
      active_dealers:   activeDealers ?? 0,
    },
  })
}
