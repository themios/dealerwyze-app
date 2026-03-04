import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

// CRM base plans
// Tier 1: $49.94/mo — Basic CRM (no SMS)
// Tier 2: $64.95/mo — CRM + SMS (1,000 msgs/mo, legacy bundle)
// Tier 3: $249.95/mo — Voice Assistant
export const PRICE_ID       = process.env.STRIPE_PRICE_ID!            // Tier 1
export const PRICE_ID_TIER2 = process.env.STRIPE_PRICE_ID_TIER2 ?? '' // Tier 2
export const PRICE_ID_TIER3 = process.env.STRIPE_PRICE_ID_TIER3 ?? '' // Tier 3
export const SMS_PRICE_ID   = process.env.STRIPE_SMS_PRICE_ID!        // Legacy add-on (keep for backward compat)
export const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://dealerwyze.com'

// SMS volume tiers (add-on to any CRM base plan)
// smsTier1: 1,000 msgs — $14.99/mo
// smsTier2: 3,000 msgs — $29.99/mo
// smsTier3: Unlimited (soft 10k) — $59.99/mo
export const PRICE_ID_SMS_1K  = process.env.STRIPE_PRICE_ID_SMS_1K  ?? ''
export const PRICE_ID_SMS_3K  = process.env.STRIPE_PRICE_ID_SMS_3K  ?? ''
export const PRICE_ID_SMS_UNL = process.env.STRIPE_PRICE_ID_SMS_UNL ?? ''

export type PlanTier    = 'tier1' | 'tier2' | 'tier3'
export type SmsTier     = 'smsTier1' | 'smsTier2' | 'smsTier3'
export type AnyPlanTier = PlanTier | SmsTier

/** SMS message quota per tier */
export const PLAN_QUOTA: Record<PlanTier, number> = {
  tier1: 0,
  tier2: 1000,
  tier3: 0,
}

/** SMS quota for standalone SMS tiers (unlimited = 10,000 soft cap) */
export const SMS_TIER_QUOTA: Record<SmsTier, number> = {
  smsTier1: 1000,
  smsTier2: 3000,
  smsTier3: 10000,
}

export const PLAN_PRICE: Record<PlanTier, number> = {
  tier1: 49.94,
  tier2: 64.95,
  tier3: 249.95,
}

export const SMS_TIER_PRICE: Record<SmsTier, number> = {
  smsTier1: 14.99,
  smsTier2: 29.99,
  smsTier3: 59.99,
}

export const SMS_TIER_LABEL: Record<SmsTier, string> = {
  smsTier1: '1,000 messages/mo',
  smsTier2: '3,000 messages/mo',
  smsTier3: 'Unlimited (10k soft cap)',
}

export const PLAN_LABEL: Record<PlanTier, string> = {
  tier1: 'Basic CRM',
  tier2: 'CRM + SMS',
  tier3: 'Voice Assistant',
}

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

/** Returns true if this plan includes SMS access */
export function planIncludesSms(tier: PlanTier): boolean {
  return tier === 'tier2'
}

/** Returns true if this plan includes voice assistant */
export function planIncludesVoice(tier: PlanTier): boolean {
  return tier === 'tier3'
}
