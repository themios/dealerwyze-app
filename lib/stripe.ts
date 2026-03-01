import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

// Tier 1: $49.94/mo — Basic CRM (no SMS)
// Tier 2: $64.95/mo — CRM + SMS (1,000 msgs/mo)
// Tier 3: $249.95/mo — Voice Assistant only (standalone, no CRM or SMS)
export const PRICE_ID       = process.env.STRIPE_PRICE_ID!            // Tier 1
export const PRICE_ID_TIER2 = process.env.STRIPE_PRICE_ID_TIER2 ?? '' // Tier 2
export const PRICE_ID_TIER3 = process.env.STRIPE_PRICE_ID_TIER3 ?? '' // Tier 3
export const SMS_PRICE_ID   = process.env.STRIPE_SMS_PRICE_ID!        // Legacy add-on (keep for backward compat)
export const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://apollo-crm.vercel.app'

export type PlanTier = 'tier1' | 'tier2' | 'tier3'

/** SMS quota per tier. Only Tier 2 includes SMS. */
export const PLAN_QUOTA: Record<PlanTier, number> = {
  tier1: 0,
  tier2: 1000,
  tier3: 0,
}

export const PLAN_PRICE: Record<PlanTier, number> = {
  tier1: 49.94,
  tier2: 64.95,
  tier3: 249.95,
}

export const PLAN_LABEL: Record<PlanTier, string> = {
  tier1: 'Basic CRM',
  tier2: 'CRM + SMS',
  tier3: 'Voice Assistant',
}

/** Derive plan tier from a Stripe price ID */
export function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === PRICE_ID_TIER2) return 'tier2'
  if (priceId === PRICE_ID_TIER3) return 'tier3'
  return 'tier1'
}

/** Returns true if this plan includes SMS access */
export function planIncludesSms(tier: PlanTier): boolean {
  return tier === 'tier2'
}

/** Returns true if this plan includes voice assistant */
export function planIncludesVoice(tier: PlanTier): boolean {
  return tier === 'tier3'
}
