import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAssignLeads } from '@/lib/auth/dealerRoles'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()

  // Only admins/managers can merge customers
  if (!canAssignLeads(profile.role)) {
    return NextResponse.json({ error: 'You do not have permission to merge contacts.' }, { status: 403 })
  }

  const { id: sourceId } = await params
  const supabase = await createClient()

  let body: { target_customer_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const targetId = body.target_customer_id
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'A target contact is required.' }, { status: 400 })
  }

  if (sourceId === targetId) {
    return NextResponse.json({ error: 'A contact cannot be merged into itself.' }, { status: 400 })
  }

  // Verify both customers belong to this org (user_id = org_id on customers table)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, primary_phone, email, archived, merged_into_customer_id')
    .in('id', [sourceId, targetId])
    .eq('user_id', profile.org_id)

  const source = customers?.find(c => c.id === sourceId)
  const target = customers?.find(c => c.id === targetId)

  if (!source || !target) {
    return NextResponse.json({ error: 'One or both contacts were not found.' }, { status: 404 })
  }

  if (source.merged_into_customer_id) {
    return NextResponse.json({ error: 'This contact has already been merged.' }, { status: 400 })
  }

  if (target.archived) {
    return NextResponse.json({ error: 'You cannot merge into an archived contact.' }, { status: 400 })
  }

  // Re-parent activities
  const { error: actErr } = await supabase
    .from('activities')
    .update({ customer_id: targetId })
    .eq('customer_id', sourceId)
  if (actErr) {
    return NextResponse.json({ error: 'Failed to transfer activity history.' }, { status: 500 })
  }

  // Re-parent tasks
  const { error: taskErr } = await supabase
    .from('tasks')
    .update({ linked_customer_id: targetId })
    .eq('linked_customer_id', sourceId)
  if (taskErr) {
    return NextResponse.json({ error: 'Failed to transfer tasks.' }, { status: 500 })
  }

  // Re-parent bhph_payments
  const { error: bhphErr } = await supabase
    .from('bhph_payments')
    .update({ customer_id: targetId })
    .eq('customer_id', sourceId)
  if (bhphErr) {
    return NextResponse.json({ error: 'Failed to transfer payment records.' }, { status: 500 })
  }

  // Re-parent customer_documents
  const { error: docErr } = await supabase
    .from('customer_documents')
    .update({ customer_id: targetId })
    .eq('customer_id', sourceId)
  if (docErr) {
    return NextResponse.json({ error: 'Failed to transfer documents.' }, { status: 500 })
  }

  // Re-parent vehicle_wants
  const { error: wantErr } = await supabase
    .from('vehicle_wants')
    .update({ customer_id: targetId })
    .eq('customer_id', sourceId)
  if (wantErr) {
    return NextResponse.json({ error: 'Failed to transfer want list.' }, { status: 500 })
  }

  // Re-parent customer_vehicles — skip dupes (unique constraint on customer_id + vehicle_id)
  const { data: sourceVehicles } = await supabase
    .from('customer_vehicles')
    .select('vehicle_id')
    .eq('customer_id', sourceId)

  if (sourceVehicles && sourceVehicles.length > 0) {
    const { data: targetVehicles } = await supabase
      .from('customer_vehicles')
      .select('vehicle_id')
      .eq('customer_id', targetId)

    const targetVehicleIds = new Set((targetVehicles ?? []).map(v => v.vehicle_id))
    const toMove = sourceVehicles.filter(v => !targetVehicleIds.has(v.vehicle_id))
    const toDrop = sourceVehicles.filter(v => targetVehicleIds.has(v.vehicle_id))

    if (toMove.length > 0) {
      const { error: cvMoveErr } = await supabase
        .from('customer_vehicles')
        .update({ customer_id: targetId })
        .eq('customer_id', sourceId)
        .in('vehicle_id', toMove.map(v => v.vehicle_id))
      if (cvMoveErr) {
        return NextResponse.json({ error: 'Failed to transfer vehicle links.' }, { status: 500 })
      }
    }

    if (toDrop.length > 0) {
      await supabase
        .from('customer_vehicles')
        .delete()
        .eq('customer_id', sourceId)
        .in('vehicle_id', toDrop.map(v => v.vehicle_id))
    }
  }

  // Re-parent customer_sequences — skip if target already has an active enrollment for that sequence
  const { data: sourceSeqs } = await supabase
    .from('customer_sequences')
    .select('id, sequence_id, status')
    .eq('customer_id', sourceId)

  if (sourceSeqs && sourceSeqs.length > 0) {
    const { data: targetSeqs } = await supabase
      .from('customer_sequences')
      .select('sequence_id, status')
      .eq('customer_id', targetId)
      .in('status', ['active', 'paused'])

    const targetActiveSeqIds = new Set((targetSeqs ?? []).map(s => s.sequence_id))

    const toMoveSeqs = sourceSeqs.filter(s => !targetActiveSeqIds.has(s.sequence_id))
    const toDropSeqs = sourceSeqs.filter(s => targetActiveSeqIds.has(s.sequence_id))

    if (toMoveSeqs.length > 0) {
      await supabase
        .from('customer_sequences')
        .update({ customer_id: targetId })
        .eq('customer_id', sourceId)
        .in('id', toMoveSeqs.map(s => s.id))
    }

    if (toDropSeqs.length > 0) {
      await supabase
        .from('customer_sequences')
        .delete()
        .eq('customer_id', sourceId)
        .in('id', toDropSeqs.map(s => s.id))
    }
  }

  // Merge contact fields: copy source values into target where target is blank
  const contactPatch: Record<string, string> = {}
  if (!target.primary_phone && source.primary_phone) {
    contactPatch.primary_phone = source.primary_phone
  }
  if (!target.email && source.email) {
    contactPatch.email = source.email
  }

  if (Object.keys(contactPatch).length > 0) {
    await supabase
      .from('customers')
      .update(contactPatch)
      .eq('id', targetId)
  }

  // Mark source as merged + archived
  const { error: mergeErr } = await supabase
    .from('customers')
    .update({
      merged_into_customer_id: targetId,
      merged_at: new Date().toISOString(),
      archived: true,
      archived_reason: 'Merged into duplicate',
    })
    .eq('id', sourceId)

  if (mergeErr) {
    return NextResponse.json({ error: 'Failed to finalize merge.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, target_customer_id: targetId })
}
