import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATES } from '@/lib/leads/states'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: customerId } = await params
  const supabase = createServiceClient()

  // Verify customer belongs to this org
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard against malformed body
  let state: string, reason: string | undefined
  try {
    const body = await req.json() as { state: string; reason?: string }
    state  = body.state
    reason = body.reason
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!LEAD_STATES.includes(state as never)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const { data: applied, error } = await supabase.rpc('advance_lead_state', {
    p_customer_id: customerId,
    p_new_state:   state,
    p_reason:      reason ?? 'Manual override',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // RPC returns false when a backward transition was blocked
  if (applied === false) {
    return NextResponse.json({ error: 'Cannot move backward in pipeline', blocked: true }, { status: 409 })
  }

  dispatchWebhook(profile.org_id, 'stage_change', {
    customer_id: customerId,
    lead_state: state,
  }).catch(() => {})

  // Log state change as a note (prefixed with author name)
  const noteBody = `Lead state → "${state}"${reason ? `: ${reason}` : ''}`
  const bodyWithAuthor = `name: ${profile.display_name}\n${noteBody}`
  await supabase.from('activities').insert({
    user_id:     profile.org_id,
    customer_id: customerId,
    type:        'note',
    body:        bodyWithAuthor,
  })

  // Any state change means the rep has taken action — address pending inbound leads
  await supabase
    .from('activities')
    .update({ addressed_at: new Date().toISOString() })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

  return NextResponse.json({ ok: true })
}
