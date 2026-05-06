/**
 * DMAIC Learning Engine — fire-and-forget event emitter.
 *
 * Uses service role (same pattern as writeAuditLog). Never throws.
 * Callers should not await unless they need confirmation — the norm is:
 *   emitEvent({ ... }).catch(() => {})
 */

import { createServiceClient } from '@/lib/supabase/service'

export type IntelligenceEventType =
  | 'lead_received'
  | 'message_sent'
  | 'message_received'
  | 'appointment_set'
  | 'appointment_shown'
  | 'appointment_missed'
  | 'lead_sold'
  | 'lead_lost'
  | 'vehicle_sold'
  | 'call_completed'
  | 'task_completed'

export interface IntelligenceEvent {
  orgId:      string
  eventType:  IntelligenceEventType
  entityType: 'lead' | 'customer' | 'vehicle' | 'activity' | 'staff'
  entityId:   string
  actorId?:   string | null
  channel?:   'sms' | 'email' | 'call' | 'in_person' | 'system' | null
  direction?: 'inbound' | 'outbound' | null
  outcome?:   string | null
  metadata?:  Record<string, unknown> | null
  occurredAt?: string
}

export async function emitEvent(event: IntelligenceEvent): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('intelligence_events').insert({
      org_id:      event.orgId,
      event_type:  event.eventType,
      entity_type: event.entityType,
      entity_id:   event.entityId,
      actor_id:    event.actorId ?? null,
      channel:     event.channel ?? null,
      direction:   event.direction ?? null,
      outcome:     event.outcome ?? null,
      metadata:    event.metadata ?? null,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
    })
    if (error) {
      console.error('[emitEvent]', event.eventType, error.message)
    }
  } catch (err) {
    console.error('[emitEvent]', event.eventType, err instanceof Error ? err.message : err)
  }
}
