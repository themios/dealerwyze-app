/**
 * Transaction types for the RE pipeline.
 * PipelineStatus mirrors the 7-stage CHECK constraint in migration 193.
 */

export type PipelineStatus =
  | 'offer'
  | 'under_contract'
  | 'inspection'
  | 'appraisal'
  | 'closing'
  | 'closed'
  | 'fallen_through'

/**
 * Legal forward transitions. Closing is terminal (no forward from 'closed').
 * Only the broker close RPC may set pipeline_status='closed' — agent PATCH
 * is blocked from that transition at the API layer.
 */
export const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  offer:          ['under_contract', 'fallen_through'],
  under_contract: ['inspection', 'fallen_through'],
  inspection:     ['appraisal', 'fallen_through'],
  appraisal:      ['closing', 'fallen_through'],
  closing:        ['closed', 'fallen_through'],
  closed:         [],
  fallen_through: [],
}

/** Returns true if transitioning from → to is a valid pipeline move. */
export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

/** Optional JSONB parties object stored on a transaction. */
export interface Parties {
  buyerAgent?:    string
  sellerAgent?:   string
  titleCompany?:  string
  lender?:        string
  notes?:         string
}

/** Full Transaction row matching the extended schema (migrations 180 + 193). */
export interface Transaction {
  id:                  string
  org_id:              string
  vehicle_id:          string
  status:              string          // legacy column; mirrors pipeline_status
  pipeline_status:     PipelineStatus
  transaction_number:  string | null
  offer_amount:        number | null
  offer_date:          string | null   // DATE as ISO string
  inspection_deadline: string | null
  contingencies:       string[]
  parties:             Parties | null
  notes:               string | null
  commission_pct:      number | null
  co_broke_pct:        number | null
  listing_agent_id:    string | null
  buyer_agent_id:      string | null
  commission_plan_id:  string | null
  commission_snapshot: Record<string, unknown> | null
  closing_date:        string | null
  final_sale_price:    number | null
  created_at:          string
  updated_at:          string | null
}
