import { z } from 'zod'

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD date')

/** Parties JSONB — each field is optional, max 200 chars */
const PartiesSchema = z.object({
  buyerAgent:   z.string().max(200).optional(),
  sellerAgent:  z.string().max(200).optional(),
  titleCompany: z.string().max(200).optional(),
  lender:       z.string().max(200).optional(),
  notes:        z.string().max(200).optional(),
})

/**
 * POST /api/transactions — create a transaction linked to a listing (vehicle).
 * vehicle_id is required; everything else is optional at creation time.
 */
export const TransactionCreateSchema = z.object({
  vehicle_id:          z.string().uuid(),
  offer_amount:        z.number().positive().optional(),
  offer_date:          dateString.optional(),
  inspection_deadline: dateString.optional(),
  contingencies:       z.array(z.string().max(100)).max(20).optional(),
  notes:               z.string().max(2000).optional(),
  commission_pct:      z.number().min(0).max(10).optional(),
  co_broke_pct:        z.number().min(0).max(10).optional(),
  listing_agent_id:    z.string().uuid().optional(),
  buyer_agent_id:      z.string().uuid().optional(),
})

export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>

/**
 * PATCH /api/transactions/[id] — agent update path.
 * pipeline_status is accepted but 'closed' is blocked at the route layer.
 * commission_snapshot and commission_plan_id are never set here — those are
 * set exclusively by the close_re_transaction RPC (Plan 09-05).
 */
export const TransactionUpdateSchema = z.object({
  pipeline_status:     z.enum([
    'offer', 'under_contract', 'inspection',
    'appraisal', 'closing', 'closed', 'fallen_through',
  ]).optional(),
  offer_amount:        z.number().positive().optional(),
  offer_date:          dateString.optional(),
  inspection_deadline: dateString.optional(),
  contingencies:       z.array(z.string().max(100)).max(20).optional(),
  notes:               z.string().max(2000).optional(),
  parties:             PartiesSchema.optional(),
  commission_pct:      z.number().min(0).max(10).optional(),
  co_broke_pct:        z.number().min(0).max(10).optional(),
  closing_date:        dateString.optional(),
  final_sale_price:    z.number().positive().optional(),
}).refine(obj => Object.keys(obj).length > 0, {
  message: 'At least one field must be provided',
})

export type TransactionUpdateInput = z.infer<typeof TransactionUpdateSchema>
