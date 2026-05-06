/**
 * Platform audit_log writer — service role only (RLS blocks authenticated INSERT).
 * Append-only table; never throws to callers.
 */

import { createServiceClient } from '@/lib/supabase/service'

export type AuditActorType = 'staff' | 'user'

export interface AuditEntry {
  orgId: string | null
  actorId: string | null
  actorType: AuditActorType
  action: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('audit_log').insert({
      org_id:      entry.orgId,
      actor_id:    entry.actorId,
      actor_type:  entry.actorType,
      action:      entry.action,
      entity_type: entry.entityType ?? null,
      entity_id:   entry.entityId ?? null,
      metadata:    entry.metadata ?? null,
      ip_address:  entry.ipAddress ?? null,
    })
    if (error) {
      console.error('[writeAuditLog]', entry.action, error.message)
    }
  } catch (err) {
    console.error('[writeAuditLog]', entry.action, err instanceof Error ? err.message : err)
  }
}
