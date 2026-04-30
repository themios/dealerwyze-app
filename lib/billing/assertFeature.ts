/**
 * assertCanUseFeature — single billing enforcement guard.
 *
 * Call this at the top of any API route or cron job that triggers a cost
 * (SMS, AI, video render, fax). It checks in order:
 *   1. Org is not suspended
 *   2. Org is not canceled (past grace period)
 *   3. Org's plan includes the requested feature
 *
 * Throws BillingError on failure so the caller can return a 402 response.
 * Returns void on success.
 *
 * Usage:
 *   try {
 *     await assertCanUseFeature(orgId, 'sms')
 *   } catch (err) {
 *     if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 402 })
 *     throw err
 *   }
 */

import { createServiceClient } from '@/lib/supabase/service'

export class BillingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingError'
  }
}

export type BillableFeature =
  | 'sms'
  | 'video'
  | 'ai_scan'
  | 'ai_brief'
  | 'ai_market'
  | 'ai_receipt'
  | 'ai_doc_summarize'
  | 'voice'
  | 'fax'
  | 'sequences'

const FEATURE_PLANS: Record<BillableFeature, Set<string>> = {
  sms:              new Set(['tier1', 'growth', 'pro', 'starter']),
  video:            new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro']),
  ai_scan:          new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  ai_brief:         new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  ai_market:        new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  ai_receipt:       new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  ai_doc_summarize: new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  voice:            new Set(['tier2', 'tier3', 'growth', 'pro']),
  fax:              new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
  sequences:        new Set(['tier1', 'tier2', 'tier3', 'growth', 'pro', 'starter']),
}

const FEATURE_LABELS: Record<BillableFeature, string> = {
  sms:              'Texting',
  video:            'Video Auto-Poster',
  ai_scan:          'AI Lead Scanner',
  ai_brief:         'AI Performance Brief',
  ai_market:        'Market Intelligence',
  ai_receipt:       'Receipt AI',
  ai_doc_summarize: 'Document AI',
  voice:            'Voice AI',
  fax:              'Fax',
  sequences:        'Automated Sequences',
}

/**
 * Checks org status and plan feature access. Throws BillingError if blocked.
 * Uses the service client so it works in cron jobs (no user session).
 */
export async function assertCanUseFeature(
  orgId: string,
  feature: BillableFeature,
): Promise<void> {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('plan, suspended_at, canceled_at, deletion_scheduled_at')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) {
    throw new BillingError('Account not found.')
  }

  if (org.suspended_at) {
    throw new BillingError(
      'Your account is suspended. Go to Settings → Billing to reactivate it.',
    )
  }

  if (org.canceled_at) {
    throw new BillingError(
      'Your account has been canceled. Go to Settings → Billing to restore access.',
    )
  }

  const plan = (org.plan ?? 'free').toLowerCase()
  const allowed = FEATURE_PLANS[feature]

  if (!allowed.has(plan)) {
    const label = FEATURE_LABELS[feature]
    if (plan === 'free') {
      throw new BillingError(
        `${label} is not available on the free plan. Upgrade to a paid plan to use this feature.`,
      )
    }
    throw new BillingError(
      `${label} is not included in your current plan. Go to Settings → Billing to upgrade.`,
    )
  }
}

/**
 * Like assertCanUseFeature but returns a result instead of throwing.
 * Useful when you want to gate UI visibility rather than hard-block an API.
 */
export async function canUseFeature(
  orgId: string,
  feature: BillableFeature,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    await assertCanUseFeature(orgId, feature)
    return { allowed: true }
  } catch (err) {
    return { allowed: false, reason: err instanceof BillingError ? err.message : 'Unknown error' }
  }
}
