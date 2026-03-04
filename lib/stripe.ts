import 'server-only'
import Stripe from 'stripe'
import type { PlanTier, SmsTier } from './stripeConstants'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

// Re-export client-safe constants and types for server use (API routes can use either file)
export type { PlanTier, SmsTier, AnyPlanTier } from './stripeConstants'
export {
  PLAN_QUOTA,
  SMS_TIER_QUOTA,
  PLAN_PRICE,
  SMS_TIER_PRICE,
  SMS_TIER_LABEL,
  PLAN_LABEL,
  planIncludesSms,
  planIncludesVoice,
} from './stripeConstants'

// CRM base plans — server-only (env)
export const PRICE_ID       = process.env.STRIPE_PRICE_ID!            // Tier 1
export const PRICE_ID_TIER2 = process.env.STRIPE_PRICE_ID_TIER2 ?? '' // Tier 2
export const PRICE_ID_TIER3 = process.env.STRIPE_PRICE_ID_TIER3 ?? '' // Tier 3
export const SMS_PRICE_ID   = process.env.STRIPE_SMS_PRICE_ID!        // Legacy add-on
export const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://dealerwyze.com'

export const PRICE_ID_SMS_1K  = process.env.STRIPE_PRICE_ID_SMS_1K  ?? ''
export const PRICE_ID_SMS_3K  = process.env.STRIPE_PRICE_ID_SMS_3K  ?? ''
export const PRICE_ID_SMS_UNL = process.env.STRIPE_PRICE_ID_SMS_UNL ?? ''

/** Map a Stripe price ID to a CRM plan tier */
export function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === PRICE_ID_TIER2) return 'tier2'
  if (priceId === PRICE_ID_TIER3) return 'tier3'
  return 'tier1'
}

/** Map a Stripe price ID to an SMS tier, returns null if not an SMS tier price */
export function smsTierFromPriceId(priceId: string): SmsTier | null {
  if (priceId === PRICE_ID_SMS_3K)  return 'smsTier2'
  if (priceId === PRICE_ID_SMS_UNL) return 'smsTier3'
  if (priceId === PRICE_ID_SMS_1K)  return 'smsTier1'
  return null
}

/** Price ID for a given SMS tier */
export function priceIdForSmsTier(tier: SmsTier): string {
  if (tier === 'smsTier2') return PRICE_ID_SMS_3K
  if (tier === 'smsTier3') return PRICE_ID_SMS_UNL
  return PRICE_ID_SMS_1K
}
