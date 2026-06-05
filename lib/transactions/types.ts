export type TransactionType = 'sale' | 'lease'

export type PipelineStatus =
  // Sale stages
  | 'offer'
  | 'under_contract'
  | 'inspection'
  | 'appraisal'
  | 'closing'
  | 'closed'
  // Lease stages
  | 'application'
  | 'approved'
  | 'lease_signed'
  | 'active'
  | 'expired'
  | 'cancelled'
  // Shared terminal
  | 'fallen_through'

export const SALE_STAGES: PipelineStatus[] = ['offer', 'under_contract', 'inspection', 'appraisal', 'closing', 'closed']
export const LEASE_STAGES: PipelineStatus[] = ['application', 'approved', 'lease_signed', 'active', 'expired']

export const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  // Sale
  offer:          ['under_contract', 'fallen_through'],
  under_contract: ['inspection', 'fallen_through'],
  inspection:     ['appraisal', 'fallen_through'],
  appraisal:      ['closing', 'fallen_through'],
  closing:        ['closed', 'fallen_through'],
  closed:         [],
  // Lease
  application:    ['approved', 'cancelled'],
  approved:       ['lease_signed', 'cancelled'],
  lease_signed:   ['active', 'cancelled'],
  active:         ['expired', 'cancelled'],
  expired:        [],
  cancelled:      [],
  // Shared
  fallen_through: [],
}

export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

/** Terminal stages cannot be advanced and should not block a new transaction. */
export function isTerminalPipelineStatus(status: PipelineStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0
}

export function isSaleStatus(status: PipelineStatus): boolean {
  return SALE_STAGES.includes(status) || status === 'fallen_through'
}

export function isLeaseStatus(status: PipelineStatus): boolean {
  return LEASE_STAGES.includes(status) || status === 'cancelled'
}

/** Optional JSONB parties object stored on a transaction. */
export interface Parties {
  // Buyer / tenant
  buyerName?:     string
  buyerPhone?:    string
  buyerEmail?:    string
  // Agents & vendors
  buyerAgent?:    string
  sellerAgent?:   string
  titleCompany?:  string
  lender?:        string
  notes?:         string
}

/** Full Transaction row matching the extended schema (migrations 180 + 193 + 199). */
export interface Transaction {
  id:                  string
  org_id:              string
  vehicle_id:          string
  status:              string
  pipeline_status:     PipelineStatus
  transaction_type:    TransactionType
  transaction_number:  string | null
  // Sale fields
  offer_amount:        number | null
  offer_date:          string | null
  inspection_deadline: string | null
  closing_date:        string | null
  closing_price:       number | null
  final_sale_price:    number | null
  commission_pct:      number | null
  co_broke_pct:        number | null
  commission_plan_id:  string | null
  commission_snapshot: Record<string, unknown> | null
  // Lease fields
  monthly_rent:        number | null
  security_deposit:    number | null
  lease_term_months:   number | null
  move_in_date:        string | null
  lease_end_date:      string | null
  // Shared
  contingencies:       string[]
  parties:             Parties | null
  notes:               string | null
  listing_agent_id:    string | null
  buyer_agent_id:      string | null
  created_at:          string
  updated_at:          string | null
}

/** Newest open (non-terminal) transaction for a listing, or null if all are closed out. */
export function pickActiveTransaction(txns: Transaction[]): Transaction | null {
  const open = txns.filter(t => !isTerminalPipelineStatus(t.pipeline_status))
  if (open.length === 0) return null
  return [...open].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
}

/** @deprecated Use pickActiveTransaction — alias for stale dev bundles after rename */
export const pickActive = pickActiveTransaction
