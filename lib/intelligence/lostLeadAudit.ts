import { createServiceClient } from '@/lib/supabase/service'

export const LOSS_REASONS = ['price', 'timing', 'competitor', 'not_ready', 'no_contact', 'other'] as const
export type LossReason = typeof LOSS_REASONS[number]
export type ArchiveReason = 'ghost' | 'manual' | 'post_last_ditch' | 'bulk'

type AuditSourceActivity = {
  id: string
  user_id: string
  customer_id: string | null
  type: string
  today_section_override?: string | null
  customer?: {
    id: string
    user_id: string
    assigned_to?: string | null
    lead_intent_tier?: string | null
    lead_intent_score?: number | null
    lead_source?: string | null
    interested_in?: string | null
    last_inbound_at?: string | null
    last_ditch_sent_at?: string | null
  } | null
}

export interface LostLeadAuditInsert {
  org_id: string
  activity_id: string | null
  customer_id: string
  assigned_rep_id: string | null
  last_human_actor_id: string | null
  archived_by: string
  archive_reason: ArchiveReason
  loss_reason: LossReason | null
  intent_tier: string | null
  intent_score: number | null
  lead_source: string | null
  touches: number
  last_inbound_at: string | null
}

function isValidLossReason(value: unknown): value is LossReason {
  return typeof value === 'string' && (LOSS_REASONS as readonly string[]).includes(value)
}

export function parseLossReason(value: unknown): LossReason | null {
  return isValidLossReason(value) ? value : null
}

export function isPostLastDitchArchive(customer: { last_ditch_sent_at?: string | null; last_inbound_at?: string | null } | null | undefined): boolean {
  const sentAt = customer?.last_ditch_sent_at
  if (!sentAt) return false
  const sentMs = new Date(sentAt).getTime()
  if (!Number.isFinite(sentMs)) return false
  if (Date.now() - sentMs < 48 * 3_600_000) return false

  const lastInboundMs = customer?.last_inbound_at ? new Date(customer.last_inbound_at).getTime() : 0
  if (lastInboundMs && lastInboundMs > sentMs) return false
  return true
}

function deriveArchiveReason(activity: AuditSourceActivity, explicitReason?: ArchiveReason): ArchiveReason {
  if (explicitReason) return explicitReason
  if (isPostLastDitchArchive(activity.customer)) return 'post_last_ditch'
  return 'manual'
}

export async function buildLostLeadAuditRow(args: {
  activityId: string
  orgId: string
  archivedBy: string
  archiveReason?: ArchiveReason
  lossReason?: LossReason | null
}): Promise<LostLeadAuditInsert | null> {
  const service = createServiceClient()
  const { activityId, orgId, archivedBy, archiveReason, lossReason = null } = args

  const { data: activity } = await service
    .from('activities')
    .select(`id, user_id, customer_id, type, today_section_override,
      customer:customers(id, user_id, assigned_to, lead_intent_tier, lead_intent_score, lead_source, interested_in, last_inbound_at, last_ditch_sent_at)
    `)
    .eq('id', activityId)
    .eq('user_id', orgId)
    .maybeSingle()

  const row = activity as AuditSourceActivity | null
  if (!row?.customer_id || !row.customer || row.customer.user_id !== orgId) return null

  const [lastHumanActor, touchCount] = await Promise.all([
    service
      .from('activities')
      .select('created_by')
      .eq('user_id', orgId)
      .eq('customer_id', row.customer_id)
      .eq('direction', 'outbound')
      .not('created_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', orgId)
      .eq('customer_id', row.customer_id)
      .eq('direction', 'outbound')
      .in('type', ['call', 'sms', 'email', 'sms_followup', 'email_followup']),
  ])

  return {
    org_id: orgId,
    activity_id: row.id,
    customer_id: row.customer_id,
    assigned_rep_id: row.customer.assigned_to ?? null,
    last_human_actor_id: (lastHumanActor.data as { created_by?: string | null } | null)?.created_by ?? null,
    archived_by: archivedBy,
    archive_reason: deriveArchiveReason(row, archiveReason),
    loss_reason: lossReason,
    intent_tier: row.customer.lead_intent_tier ?? null,
    intent_score: row.customer.lead_intent_score ?? null,
    lead_source: row.customer.lead_source ?? row.type ?? null,
    touches: touchCount.count ?? 0,
    last_inbound_at: row.customer.last_inbound_at ?? null,
  }
}
