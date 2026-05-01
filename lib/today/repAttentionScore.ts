import type { QueueItem } from './queueSort'
import type { Customer } from '@/types'

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

function recencyScore(iso: string | null | undefined): number {
  if (!iso) return 0
  const diffMs = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 25
  const diffHours = diffMs / 3_600_000
  if (diffHours >= 48) return 0
  return ((48 - diffHours) / 48) * 25
}

export function computeRepAttentionScore(item: QueueItem): number {
  const customer = ('customer' in item.data ? item.data.customer : null) as Partial<Customer> | null
  const intent = Math.max(0, Math.min(100, customer?.lead_intent_score ?? item.decision.winLikelihood * 100))
  const urgency = Math.max(0, Math.min(100, item.decision.delayRisk * 100))

  let score =
    intent * 0.30 +
    recencyScore(customer?.last_inbound_at) +
    urgency * 0.20

  if ((customer?.prior_purchase_count ?? 0) > 0) score += 15
  if (!!customer?.primary_phone && !customer?.sms_opt_out) score += 10
  if (item.section === 'ai_handling' && !item.takeoverSignal) score -= 20
  if (item.section === 'replied') score += 25

  return clamp(Math.round(score))
}
