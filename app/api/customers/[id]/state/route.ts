import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ORG_STAGES } from '@/lib/leads/states'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import { emitEvent, type IntelligenceEventType } from '@/lib/intelligence/emitEvent'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: customerId } = await params
  const supabase = await createClient()

  // Verify customer belongs to this org
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let state: string, reason: string | undefined
  try {
    const body = await req.json() as { state: string; reason?: string }
    state  = body.state
    reason = body.reason
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Fetch org stages to validate the new state and check is_hot
  const { data: orgStagesData } = await supabase
    .from('org_pipeline_stages')
    .select('stage_key, is_hot, is_active')
    .eq('org_id', profile.org_id)

  const orgStages = orgStagesData?.length ? orgStagesData : DEFAULT_ORG_STAGES
  const targetStage = orgStages.find(s => s.stage_key === state && s.is_active)

  if (!targetStage) {
    return NextResponse.json({ error: 'Invalid or inactive stage' }, { status: 400 })
  }

  const { error } = await supabase.rpc('advance_lead_state', {
    p_customer_id: customerId,
    p_new_state:   state,
    p_reason:      reason ?? 'Manual override',
  })

  if (error) return NextResponse.json({ error: 'Failed to update state' }, { status: 500 })

  // Auto-mark hot if the stage is flagged is_hot
  if (targetStage.is_hot) {
    await supabase
      .from('customers')
      .update({ lead_rating: 'hot' })
      .eq('id', customerId)
  }

  dispatchWebhook(profile.org_id, 'stage_change', {
    customer_id: customerId,
    lead_state: state,
  }).catch(() => {})

  // Log state change as a note
  const noteBody = `Lead state changed to "${state}"${reason ? `: ${reason}` : ''}`
  await supabase.from('activities').insert({
    user_id:     profile.org_id,
    customer_id: customerId,
    type:        'note',
    body:        `name: ${profile.display_name}\n${noteBody}`,
  })

  // Address pending inbound leads for this customer
  await supabase
    .from('activities')
    .update({ addressed_at: new Date().toISOString() })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

  const stateToEvent: Partial<Record<string, IntelligenceEventType>> = {
    appointment_set:       'appointment_set',
    appointment_confirmed: 'appointment_set',
    sold:                  'lead_sold',
    lost:                  'lead_lost',
  }
  const eventType = stateToEvent[state]
  if (eventType) {
    emitEvent({
      orgId:      profile.org_id,
      eventType,
      entityType: 'customer',
      entityId:   customerId,
      actorId:    profile.id,
      metadata:   { state, reason: reason ?? null },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
