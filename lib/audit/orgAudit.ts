import { createServiceClient } from '@/lib/supabase/service'

type ActorType = 'user' | 'staff' | 'system' | 'webhook'

export interface OrgAuditEntry {
  org_id:     string | null
  actor_id?:  string | null
  actor_type: ActorType
  action:     string
  details?:   Record<string, unknown>
  ip?:        string | null
}

/**
 * Write a security-sensitive event to org_audit_log.
 * Uses service client — intentional: must write even when RLS would block the caller.
 * Never throws; audit failures are logged but do not interrupt the main flow.
 */
export async function logOrgAudit(entry: OrgAuditEntry): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('org_audit_log').insert({
      org_id:     entry.org_id,
      actor_id:   entry.actor_id ?? null,
      actor_type: entry.actor_type,
      action:     entry.action,
      details:    entry.details ?? null,
      ip:         entry.ip ?? null,
    })
  } catch (err) {
    console.error('[orgAudit] failed to write audit entry:', entry.action, err instanceof Error ? err.message : err)
  }
}
