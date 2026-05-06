/**
 * Zod shapes for Stripe webhook `event.data.object` payloads we branch on.
 * Validates after signature verification; 400 on mismatch (no internal details).
 */

import { z } from 'zod'

export const StripeCheckoutSessionCompletedObjectSchema = z
  .object({
    id: z.string(),
    mode: z.enum(['payment', 'subscription', 'setup']),
    metadata: z.record(z.string(), z.string()).optional().nullable(),
    subscription: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).optional().nullable(),
    amount_total: z.number().nullable().optional(),
    invoice: z.union([z.string(), z.object({}).passthrough(), z.null()]).optional(),
  })
  .passthrough()

export const StripePaymentIntentSucceededObjectSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
    metadata: z.record(z.string(), z.string()).optional().nullable(),
  })
  .passthrough()
