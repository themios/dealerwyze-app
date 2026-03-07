/**
 * Stripe-related types and display constants only.
 * Safe to import from client components (e.g. billing settings page).
 * Do NOT import the Stripe SDK or env-dependent config here — use @/lib/stripe on the server.
 *
 * PLAN MODEL (as of March 2026):
 *   free  — Free plan       $0/mo      (200 contacts, 100 vehicles; no SMS/voice/fax/scan)
 *   tier1 — Complete CRM   $150/mo    (SMS, fax, scan, contacts, inventory, BHPH, analytics)
 *   tier2 — Voice AI       $200/mo    (standalone AI receptionist; pairs with tier1 for full stack)
 *   tier3 — LEGACY         kept for backwards-compat with existing DB records; do not sell
 *
 * ANNUAL BILLING: 10% discount — $135/mo (tier1) / $180/mo (tier2)
 *
 * OVERAGE (opt-in only, dealer must agree):
 *   Voice: $0.12/min over 700 min/mo included cap  (~53% margin over $0.0785/min cost)
 *   SMS:   $0.08/msg over 1,000 msg/mo quota        (~84% margin over $0.0128/msg cost)
 *   MMS:   $0.08/msg over 200 MMS/mo quota
 */

export type PlanTier    = 'free' | 'tier1' | 'tier2' | 'tier3'
export type SmsTier     = 'smsTier1' | 'smsTier2' | 'smsTier3'
export type AnyPlanTier = PlanTier | SmsTier

/** Annual billing discount (10%) */
export const ANNUAL_DISCOUNT = 0.10

/** Free plan hard limits */
export const FREE_PLAN_LIMITS = {
  contacts: 200,
  vehicles: 100,
} as const

/** Voice minutes included per billing month (700 min ≈ 23 calls/day at 30s avg) */
export const VOICE_MINUTES_INCLUDED = 700

/** SMS message quota included per plan tier */
export const PLAN_QUOTA: Record<PlanTier, number> = {
  free:  0,      // Free plan — no SMS
  tier1: 1000,   // Complete CRM — 1,000 SMS/mo bundled
  tier2: 0,      // Voice AI only — no SMS included
  tier3: 0,      // Legacy
}

/** MMS messages included per month (paid plans with SMS only) */
export const MMS_INCLUDED = 200

/** SMS quota for standalone SMS add-on tiers (legacy — new plans bundle SMS in tier1) */
export const SMS_TIER_QUOTA: Record<SmsTier, number> = {
  smsTier1: 1000,
  smsTier2: 3000,
  smsTier3: 10000,
}

export const PLAN_PRICE: Record<PlanTier, number> = {
  free:  0,
  tier1: 150,
  tier2: 200,
  tier3: 249.95,  // Legacy — not sold; kept for existing records
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
  free:  'Free',
  tier1: 'Complete CRM',
  tier2: 'Voice AI',
  tier3: 'Legacy',
}

export const PLAN_DESCRIPTION: Record<PlanTier, string> = {
  free:  'Up to 200 contacts · 100 vehicles · No SMS/voice/fax',
  tier1: 'CRM · SMS · Fax · Scan · Contacts · Inventory · BHPH · Analytics',
  tier2: 'AI Receptionist · Lead Capture · Appointments (pairs with Complete CRM)',
  tier3: 'Legacy plan',
}

/** Returns true if this plan includes bundled SMS */
export function planIncludesSms(tier: PlanTier): boolean {
  return tier === 'tier1'
}

/** Returns true if this plan includes the AI voice assistant */
export function planIncludesVoice(tier: PlanTier): boolean {
  return tier === 'tier2'
}

/** Returns true if this is a free plan */
export function isFreePlan(tier: PlanTier): boolean {
  return tier === 'free'
}

/** Voice overage opt-in rate ($/min above VOICE_MINUTES_INCLUDED) */
export const VOICE_OVERAGE_RATE = 0.12  // $0.12/min — cost $0.0785/min → ~53% margin

/** SMS/MMS overage opt-in rate ($/msg above plan quota) */
export const SMS_OVERAGE_RATE = 0.08    // $0.08/msg — cost $0.0128/msg → ~84% margin
