import { createServiceClient } from '@/lib/supabase/service'

export type ThreadState =
  | 'new_lead' | 'contacted' | 'engaged'
  | 'appointment_set' | 'appointment_confirmed'
  | 'showed' | 'sold' | 'lost' | 'dormant'

type ThreadEvent =
  | 'outbound_sent'
  | 'inbound_received'
  | 'appointment_created'
  | 'appointment_confirmed_reply'
  | 'mark_sold'
  | 'mark_lost'

/** State transition table */
const TRANSITIONS: Partial<Record<ThreadState, Partial<Record<ThreadEvent, ThreadState>>>> = {
  new_lead:              { outbound_sent: 'contacted', inbound_received: 'engaged' },
  contacted:             { inbound_received: 'engaged' },
  engaged:               { appointment_created: 'appointment_set' },
  appointment_set:       { appointment_confirmed_reply: 'appointment_confirmed', inbound_received: 'appointment_confirmed' },
  dormant:               { outbound_sent: 'contacted', inbound_received: 'engaged' },
}

export async function transitionThreadState(
  customerId: string,
  event: ThreadEvent,
): Promise<void> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: customer } = await supabase
    .from('customers')
    .select('thread_state, engagement_score')
    .eq('id', customerId)
    .single()

  if (!customer) return

  const current = customer.thread_state as ThreadState
  const nextState = TRANSITIONS[current]?.[event]

  const patch: Record<string, unknown> = {}

  // Always update timestamps
  if (event === 'outbound_sent')   patch.last_outbound_at = now
  if (event === 'inbound_received') {
    patch.last_inbound_at = now
    patch.engagement_score = (customer.engagement_score ?? 0) + 1
  }

  // Terminal states: sold/lost never transition back automatically
  if (event === 'mark_sold') { patch.thread_state = 'sold' }
  else if (event === 'mark_lost') { patch.thread_state = 'lost' }
  else if (nextState && current !== 'sold' && current !== 'lost') {
    patch.thread_state = nextState
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from('customers').update(patch).eq('id', customerId)
  }
}
