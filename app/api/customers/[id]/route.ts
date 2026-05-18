import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAssignLeads } from '@/lib/auth/dealerRoles'
import { isMultiLocationOrg } from '@/lib/locations/resolve'
import { createServiceClient } from '@/lib/supabase/service'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: customerId } = await params
  const supabase = await createClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // assigned_to changes require dealer_admin or dealer_manager
  if ('assigned_to' in body && !canAssignLeads(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify customer belongs to this org and fetch location_id for blocking check
  const { data: existing } = await supabase
    .from('customers')
    .select('id, location_id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Server-side location gate: block assignment and automation changes for unresolved
  // multi-location leads. Matches the UI block in LeadLocationBlockingModal.
  const isLocationSensitive = 'assigned_to' in body || 'automation_override' in body
  if (isLocationSensitive && !existing.location_id) {
    // Service client used here to query org metadata without a second authenticated call.
    const svc = createServiceClient()
    const multi = await isMultiLocationOrg(profile.org_id, svc)
    if (multi) {
      return NextResponse.json(
        { error: 'Assign a location to this lead before making assignment or automation changes.' },
        { status: 422 },
      )
    }
  }

  // Only allow safe fields through this route
  const VALID_AUTO_MODES = ['manual', 'semi_auto', 'full_auto']
  const allowed: Record<string, unknown> = {}
  if ('assigned_to' in body) {
    const targetId = body.assigned_to ?? null
    if (targetId !== null) {
      // Verify the target profile belongs to this org — prevents cross-tenant assignment.
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', targetId)
        .eq('org_id', profile.org_id)
        .maybeSingle()
      if (!targetProfile) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }
    allowed.assigned_to = targetId
  }
  if ('automation_override' in body) {
    const v = body.automation_override
    if (v !== null && !VALID_AUTO_MODES.includes(v as string)) {
      return NextResponse.json({ error: 'Invalid automation_override' }, { status: 400 })
    }
    allowed.automation_override = v ?? null
  }
  if ('unsubscribe_sms' in body && typeof body.unsubscribe_sms === 'boolean') {
    allowed.unsubscribe_sms = body.unsubscribe_sms
    if (body.unsubscribe_sms) allowed.unsubscribed_at = new Date().toISOString()
  }
  if ('unsubscribe_email' in body && typeof body.unsubscribe_email === 'boolean') {
    allowed.unsubscribe_email = body.unsubscribe_email
    if (body.unsubscribe_email) allowed.unsubscribed_at = new Date().toISOString()
  }
  if ('archived' in body && typeof body.archived === 'boolean') {
    allowed.archived = body.archived
  }
  if ('archived_reason' in body) {
    const reason = body.archived_reason
    allowed.archived_reason = typeof reason === 'string' && reason.trim() ? reason.trim() : null
  }

  // Auto-complete open tasks when archiving so they don't linger on the Today page
  const isArchiving = allowed.archived === true

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('customers')
    .update(allowed)
    .eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (isArchiving) {
    await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('linked_customer_id', customerId)
      .eq('user_id', profile.org_id)
      .eq('status', 'open')
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  if (!canAssignLeads(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: customerId } = await params
  const supabase = await createClient()

  // Verify customer belongs to this org before deleting.
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Best-effort cleanup of dependent records to avoid FK conflicts.
  const cleanupResults = await Promise.all([
    supabase
      .from('vehicles')
      .update({ sold_to_customer_id: null })
      .eq('user_id', profile.org_id)
      .eq('sold_to_customer_id', customerId),
    supabase.from('tasks').delete().eq('linked_customer_id', customerId),
    supabase.from('customer_vehicles').delete().eq('customer_id', customerId),
    supabase.from('customer_documents').delete().eq('customer_id', customerId),
    supabase.from('customer_sequences').delete().eq('customer_id', customerId).eq('org_id', profile.org_id),
    supabase.from('vehicle_wants').delete().eq('customer_id', customerId).eq('user_id', profile.org_id),
    supabase.from('bhph_payments').delete().eq('customer_id', customerId).eq('user_id', profile.org_id),
    supabase.from('activities').delete().eq('customer_id', customerId).eq('user_id', profile.org_id),
  ])

  for (const result of cleanupResults) {
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
  }

  const { error: deleteError } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('user_id', profile.org_id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
