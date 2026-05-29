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

export const CommissionPlanCreateSchema = z
  .object({
    plan_type: z
      .enum(['percentage_split', 'flat_fee', 'tiered'])
      .default('percentage_split'),
    tier_name: z.string().max(100).optional(),
    /** null = org-level default plan */
    agent_id: z.string().uuid().nullable().optional(),
    /** Required when plan_type = 'percentage_split' */
    agent_split_pct: z.number().min(0).max(100).optional().nullable(),
    /**
     * Caller may omit; API computes as 100 - agent_split_pct for percentage_split plans.
     */
    broker_split_pct: z.number().min(0).max(100).optional().nullable(),
    referral_fee_flat: z.number().min(0).default(0),
    referral_fee_pct: z.number().min(0).max(100).default(0),
    is_default: z.boolean().default(false),
    /** Minimum GCI threshold before this tier activates (used for tiered plans) */
    threshold_gci: z.number().min(0).optional().nullable(),
    effective_at: z.string().optional().nullable(),
  })
  .superRefine(requireAgentSplitForPct)

export type CommissionPlanCreate = z.infer<typeof CommissionPlanCreateSchema>

export const CommissionPlanUpdateSchema = CommissionPlanCreateSchema.partial().superRefine(
  requireAgentSplitForPct,
)

export type CommissionPlanUpdate = z.infer<typeof CommissionPlanUpdateSchema>
