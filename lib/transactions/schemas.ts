import { z } from 'zod'

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD date').nullish()

const PartiesSchema = z.object({
  buyerName:    z.string().max(200).nullish(),
  buyerPhone:   z.string().max(30).nullish(),
  buyerEmail:   z.string().email().max(200).nullish(),
  buyerAgent:   z.string().max(200).nullish(),
  sellerAgent:  z.string().max(200).nullish(),
  titleCompany: z.string().max(200).nullish(),
  lender:       z.string().max(200).nullish(),
  notes:        z.string().max(500).nullish(),
})

const ALL_STATUSES = [
  'offer', 'under_contract', 'inspection', 'appraisal', 'closing', 'closed',
  'application', 'approved', 'lease_signed', 'active', 'expired', 'cancelled',
  'fallen_through',
] as const

export const TransactionCreateSchema = z.object({
  vehicle_id:          z.string().uuid(),
  transaction_type:    z.enum(['sale', 'lease']).default('sale'),
  // Sale fields
  offer_amount:        z.number().positive().nullish(),
  offer_date:          dateString,
  inspection_deadline: dateString,
  contingencies:       z.array(z.string().max(100)).max(20).nullish(),
  commission_pct:      z.number().min(0).max(100).nullish(),
  co_broke_pct:        z.number().min(0).max(100).nullish(),
  closing_date:        dateString,
  final_sale_price:    z.number().positive().nullish(),
  // Lease fields
  monthly_rent:        z.number().positive().nullish(),
  security_deposit:    z.number().min(0).nullish(),
  lease_term_months:   z.number().int().positive().nullish(),
  move_in_date:        dateString,
  lease_end_date:      dateString,
  // Shared
  notes:               z.string().max(2000).nullish(),
  parties:             PartiesSchema.nullish(),
  listing_agent_id:    z.string().uuid().nullish(),
  buyer_agent_id:      z.string().uuid().nullish(),
})

export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>

export const TransactionUpdateSchema = z.object({
  pipeline_status:     z.enum(ALL_STATUSES).optional(),
  transaction_type:    z.enum(['sale', 'lease']).optional(),
  offer_amount:        z.number().positive().nullish(),
  offer_date:          dateString,
  inspection_deadline: dateString,
  contingencies:       z.array(z.string().max(100)).max(20).nullish(),
  commission_pct:      z.number().min(0).max(100).nullish(),
  co_broke_pct:        z.number().min(0).max(100).nullish(),
  closing_date:        dateString,
  final_sale_price:    z.number().positive().nullish(),
  monthly_rent:        z.number().positive().nullish(),
  security_deposit:    z.number().min(0).nullish(),
  lease_term_months:   z.number().int().positive().nullish(),
  move_in_date:        dateString,
  lease_end_date:      dateString,
  notes:               z.string().max(2000).nullish(),
  parties:             PartiesSchema.nullish(),
  commission_pct_update: z.number().min(0).max(100).nullish(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' })

export type TransactionUpdateInput = z.infer<typeof TransactionUpdateSchema>
