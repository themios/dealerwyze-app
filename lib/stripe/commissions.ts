import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

export type CommissionEventType = 'first_month' | 'recurring' | 'free_to_paid'

export interface RecordCommissionParams {
  affiliateCode:      string
  orgId:              string
  eventType:          CommissionEventType
  invoiceAmountCents: number   // raw Stripe amount_total (cents)
  billingPeriod:      string   // 'YYYY-MM'
  stripeInvoiceId:    string
  commissionPct:      number   // e.g. 10 for 10%
}

/**
 * Insert a commission_ledger row for an earned commission.
 * Non-fatal — logs error but does not throw so webhook processing continues.
 */
export async function recordCommission(params: RecordCommissionParams): Promise<void> {
  if (!params.affiliateCode || params.invoiceAmountCents <= 0) return

  const amount = parseFloat(
    ((params.invoiceAmountCents / 100) * (params.commissionPct / 100)).toFixed(2)
  )
  if (amount < 0.01) return  // skip trivial rounding artifacts

  const service = createServiceClient()
  const { error } = await service.from('commission_ledger').insert({
    affiliate_code:    params.affiliateCode,
    org_id:            params.orgId,
    event_type:        params.eventType,
    amount,
    billing_period:    params.billingPeriod,
    stripe_invoice_id: params.stripeInvoiceId || null,
  })

  if (error) {
    // Unique constraint violation = already credited (idempotent — ignore)
    if (error.code === '23505') return
    console.error('[commissions] recordCommission error:', error.message, params)
  }
}

/**
 * Returns commission summary for all affiliate codes.
 * Used by GET /api/admin/commissions.
 */
export interface CommissionSummary {
  affiliate_code:  string
  owner_name:      string
  owner_email:     string | null
  type:            string
  pending_balance: number
  is_payable:      boolean   // pending_balance >= MIN_PAYOUT
  all_time_paid:   number
}

export const MIN_PAYOUT = 25  // $25 minimum payout threshold

export async function getCommissionSummaries(vertical: 'dealer' | 'real_estate' = 'dealer'): Promise<CommissionSummary[]> {
  const service = createServiceClient()

  // Get affiliate codes scoped to the current vertical
  const { data: codes } = await service
    .from('affiliate_codes')
    .select('code, type, owner_name, owner_email, is_active')
    .eq('vertical', vertical)
    .order('created_at', { ascending: false })

  if (!codes || codes.length === 0) return []

  // Get commission totals per code grouped by status
  const { data: ledger } = await service
    .from('commission_ledger')
    .select('affiliate_code, status, amount')

  const byCode: Record<string, { pending: number; paid: number }> = {}
  for (const row of (ledger ?? [])) {
    if (!byCode[row.affiliate_code]) byCode[row.affiliate_code] = { pending: 0, paid: 0 }
    if (row.status === 'pending') byCode[row.affiliate_code].pending += Number(row.amount)
    else if (row.status === 'paid')   byCode[row.affiliate_code].paid   += Number(row.amount)
  }

  return codes.map(c => {
    const totals = byCode[c.code] ?? { pending: 0, paid: 0 }
    const pending = parseFloat(totals.pending.toFixed(2))
    return {
      affiliate_code:  c.code,
      owner_name:      c.owner_name,
      owner_email:     c.owner_email ?? null,
      type:            c.type,
      pending_balance: pending,
      is_payable:      pending >= MIN_PAYOUT,
      all_time_paid:   parseFloat(totals.paid.toFixed(2)),
    }
  })
}
