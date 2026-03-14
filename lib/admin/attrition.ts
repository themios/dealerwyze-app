/**
 * Attrition scoring for DealerWyze tenants.
 * Score: 0–100  (higher = healthier, lower = at-risk)
 * Tiers: Healthy ≥65 | At-Risk 35–64 | Critical 0–34
 */

export type AttritionTier = 'healthy' | 'at_risk' | 'critical'

export interface AttritionSignal {
  label: string
  delta: number      // points contribution (positive = good, negative = bad)
  note:  string
}

export interface AttritionResult {
  score:   number
  tier:    AttritionTier
  signals: AttritionSignal[]
}

export interface OrgAttritionInput {
  subscription_status:   string | null
  last_active_at:        string | null   // ISO timestamp of last login
  has_active_email:      boolean
  onboarding_done:       boolean
  sms_used_pct:          number          // 0-100
  monthly_message_count: number
  tickets_open:          number
  past_due_days:         number          // 0 if not past_due
  trial_days_left:       number | null   // null if not trialing
}

export function computeAttritionScore(org: OrgAttritionInput): AttritionResult {
  const signals: AttritionSignal[] = []
  let score = 50  // neutral baseline

  // 1. Subscription health
  if (org.subscription_status === 'active') {
    signals.push({ label: 'Active subscription', delta: +15, note: 'Paying customer' })
    score += 15
  } else if (org.subscription_status === 'trialing') {
    const note = org.trial_days_left !== null
      ? `${org.trial_days_left}d left in trial`
      : 'In trial'
    const delta = (org.trial_days_left ?? 99) < 7 ? -10 : +5
    signals.push({ label: 'Trial', delta, note })
    score += delta
  } else if (org.subscription_status === 'past_due') {
    const delta = -20 - Math.min(org.past_due_days * 2, 20)
    signals.push({ label: 'Past due', delta, note: `${org.past_due_days}d overdue` })
    score += delta
  } else if (org.subscription_status === 'canceled') {
    signals.push({ label: 'Canceled', delta: -40, note: 'Subscription canceled' })
    score -= 40
  }

  // 2. Login recency
  if (org.last_active_at) {
    const days = (Date.now() - new Date(org.last_active_at).getTime()) / 86400000
    if (days < 2) {
      signals.push({ label: 'Active today', delta: +15, note: 'Logged in within 48h' })
      score += 15
    } else if (days < 7) {
      signals.push({ label: 'Active this week', delta: +10, note: `${Math.round(days)}d ago` })
      score += 10
    } else if (days < 14) {
      signals.push({ label: 'Active 2 weeks', delta: +0, note: `${Math.round(days)}d ago` })
    } else if (days < 30) {
      signals.push({ label: 'Low activity', delta: -10, note: `${Math.round(days)}d since last login` })
      score -= 10
    } else {
      signals.push({ label: 'Dormant', delta: -25, note: `${Math.round(days)}d since last login — high churn risk` })
      score -= 25
    }
  } else {
    signals.push({ label: 'Never logged in', delta: -20, note: 'No login recorded' })
    score -= 20
  }

  // 3. Email integration
  if (org.has_active_email) {
    signals.push({ label: 'Email connected', delta: +10, note: 'Gmail/IMAP integration active' })
    score += 10
  } else {
    signals.push({ label: 'No email integration', delta: -5, note: 'Not using email features' })
    score -= 5
  }

  // 4. Onboarding completion
  if (org.onboarding_done) {
    signals.push({ label: 'Onboarding complete', delta: +10, note: 'Setup wizard finished' })
    score += 10
  } else {
    signals.push({ label: 'Onboarding incomplete', delta: -10, note: 'Setup not finished — low feature adoption' })
    score -= 10
  }

  // 5. SMS usage (proxy for core workflow adoption)
  if (org.sms_used_pct >= 30) {
    signals.push({ label: 'Active texter', delta: +10, note: `${org.sms_used_pct}% of quota used` })
    score += 10
  } else if (org.sms_used_pct >= 10) {
    signals.push({ label: 'Low SMS usage', delta: +5, note: `${org.sms_used_pct}% of quota` })
    score += 5
  } else if (org.monthly_message_count === 0) {
    signals.push({ label: 'Zero messages sent', delta: -15, note: 'No texts sent this month' })
    score -= 15
  }

  // 6. Open support tickets (signal of frustration or struggle)
  if (org.tickets_open >= 3) {
    signals.push({ label: 'Multiple open tickets', delta: -10, note: `${org.tickets_open} unresolved — possible product friction` })
    score -= 10
  } else if (org.tickets_open >= 1) {
    signals.push({ label: 'Open ticket', delta: -5, note: `${org.tickets_open} open ticket` })
    score -= 5
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const tier: AttritionTier =
    clamped >= 65 ? 'healthy' :
    clamped >= 35 ? 'at_risk' :
    'critical'

  return { score: clamped, tier, signals }
}

export function tierLabel(tier: AttritionTier): string {
  return tier === 'healthy' ? 'Healthy' : tier === 'at_risk' ? 'At Risk' : 'Critical'
}

export function tierColor(tier: AttritionTier): string {
  return tier === 'healthy' ? 'text-green-600' : tier === 'at_risk' ? 'text-yellow-600' : 'text-red-600'
}

export function tierBg(tier: AttritionTier): string {
  return tier === 'healthy'
    ? 'bg-green-100 text-green-700 border-green-200'
    : tier === 'at_risk'
    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-red-100 text-red-700 border-red-200'
}
