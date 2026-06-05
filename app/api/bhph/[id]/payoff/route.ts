/**
 * GET /api/bhph/[id]/payoff?asOf=YYYY-MM-DD
 * Payoff quote: principal + accrued simple interest through asOf (default today).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import { computeBhphOutstandingBalance } from '@/lib/bhph/balance'
import { bhphAccrualAnchorDate, computeBhphPayoffQuote } from '@/lib/bhph/payoff'
import { sumLedgerInterestYtd } from '@/lib/bhph/ledgerReplay'
import type { UserRole } from '@/types/index'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractId } = await params
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const asOfParam = req.nextUrl.searchParams.get('asOf')
  if (asOfParam != null && asOfParam !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(asOfParam)) {
    return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 })
  }
  const asOfDate =
    asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam) ? asOfParam : today
  if (asOfParam && asOfDate < today) {
    return NextResponse.json({ error: 'Payoff date cannot be in the past' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: contract, error: cErr } = await supabase
    .from('bhph_payments')
    .select(
      'id, user_id, loan_amount, down_payment, total_paid, principal_balance, interest_rate, last_payment_date, frequency_anchor_date, created_at, total_interest_paid',
    )
    .eq('id', contractId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (cErr || !contract) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const principalBalance =
    contract.principal_balance != null
      ? Math.max(0, Number(contract.principal_balance))
      : computeBhphOutstandingBalance(contract)
  const quote = computeBhphPayoffQuote({
    principalBalance,
    interestRate: contract.interest_rate,
    lastPaymentDate: contract.last_payment_date,
    accrualAnchorDate: bhphAccrualAnchorDate(contract),
    asOfDate,
  })

  const { data: ledger } = await supabase
    .from('bhph_payment_ledger')
    .select('payment_date, interest_portion')
    .eq('bhph_contract_id', contractId)
    .eq('user_id', profile.org_id)

  const year = parseInt(asOfDate.slice(0, 4), 10)
  const ytdInterestPaid = sumLedgerInterestYtd(ledger ?? [], year)

  return NextResponse.json({
    asOfDate,
    principalBalance,
    totalInterestPaid: contract.total_interest_paid ?? 0,
    ytdInterestPaid,
    payoff: quote,
  })
}
