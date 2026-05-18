import { logOrgAudit } from '@/lib/audit/orgAudit'
import { writeAuditLog } from '@/lib/audit/log'

export type LocationAuditAction =
  | 'location_created'
  | 'location_updated'
  | 'location_staff_assigned'
  | 'location_staff_removed'
  | 'lead_location_changed'

export function logLocationAudit(params: {
  orgId: string
  actorId: string
  action: LocationAuditAction
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}): void {
  const { orgId, actorId, action, entityType, entityId, metadata } = params
  void writeAuditLog({
    orgId,
    actorId,
    actorType: 'user',
    action,
    entityType,
    entityId,
    metadata: metadata ?? null,
  })
  void logOrgAudit({
    org_id: orgId,
    actor_id: actorId,
    actor_type: 'user',
    action,
    details: { entity_type: entityType, entity_id: entityId, ...metadata },
  })
}
