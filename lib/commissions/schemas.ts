import { z } from 'zod'

/**
 * Shared refinement: percentage_split plans require agent_split_pct.
 */
function requireAgentSplitForPct(
  val: { plan_type?: string; agent_split_pct?: number | null },
  ctx: z.RefinementCtx,
) {
  if (val.plan_type === 'percentage_split' && (val.agent_split_pct == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'agent_split_pct is required when plan_type is percentage_split',
      path: ['agent_split_pct'],
    })
  }
}

// Base object without refinements so .partial() can be safely called on it
const CommissionPlanBaseSchema = z.object({
  plan_type:         z.enum(['percentage_split', 'flat_fee', 'tiered']).default('percentage_split'),
  tier_name:         z.string().max(100).optional(),
  agent_id:          z.string().uuid().nullable().optional(),
  agent_split_pct:   z.number().min(0).max(100).optional().nullable(),
  broker_split_pct:  z.number().min(0).max(100).optional().nullable(),
  referral_fee_flat: z.number().min(0).default(0),
  referral_fee_pct:  z.number().min(0).max(100).default(0),
  is_default:        z.boolean().default(false),
  threshold_gci:     z.number().min(0).optional().nullable(),
  effective_at:      z.string().optional().nullable(),
})

export const CommissionPlanCreateSchema = CommissionPlanBaseSchema.superRefine(requireAgentSplitForPct)
export type CommissionPlanCreate = z.infer<typeof CommissionPlanCreateSchema>

export const CommissionPlanUpdateSchema = CommissionPlanBaseSchema.partial().superRefine(requireAgentSplitForPct)
export type CommissionPlanUpdate = z.infer<typeof CommissionPlanUpdateSchema>
