import { describe, expect, it } from 'vitest'
import {
  isTerminalPipelineStatus,
  pickActiveTransaction,
  type Transaction,
} from '@/lib/transactions/types'

function txn(id: string, status: Transaction['pipeline_status'], created_at: string): Transaction {
  return {
    id,
    org_id: 'org',
    vehicle_id: 'veh',
    status: 'offer',
    pipeline_status: status,
    transaction_type: 'lease',
    transaction_number: id,
    offer_amount: null,
    offer_date: null,
    inspection_deadline: null,
    closing_date: null,
    closing_price: null,
    final_sale_price: null,
    commission_pct: null,
    co_broke_pct: null,
    commission_plan_id: null,
    commission_snapshot: null,
    monthly_rent: null,
    security_deposit: null,
    lease_term_months: null,
    move_in_date: null,
    lease_end_date: null,
    contingencies: [],
    parties: null,
    notes: null,
    listing_agent_id: null,
    buyer_agent_id: null,
    created_at,
    updated_at: null,
  }
}

describe('pickActiveTransaction', () => {
  it('treats cancelled lease as terminal', () => {
    expect(isTerminalPipelineStatus('cancelled')).toBe(true)
    const active = pickActiveTransaction([
      txn('a', 'cancelled', '2026-06-01T00:00:00Z'),
    ])
    expect(active).toBeNull()
  })

  it('returns newest open transaction', () => {
    const active = pickActiveTransaction([
      txn('old', 'cancelled', '2026-05-01T00:00:00Z'),
      txn('new', 'application', '2026-06-01T00:00:00Z'),
    ])
    expect(active?.id).toBe('new')
  })
})
