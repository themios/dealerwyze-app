/**
 * Stripe-related types and display constants only.
 * Safe to import from client components (e.g. billing settings page).
 * Do NOT import the Stripe SDK or env-dependent config here — use @/lib/stripe on the server.
 */

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

/** Returns true if this plan includes SMS access */
export function planIncludesSms(tier: PlanTier): boolean {
  return tier === 'tier2'
}

/** Returns true if this plan includes voice assistant */
export function planIncludesVoice(tier: PlanTier): boolean {
  return tier === 'tier3'
}
