/**
 * POST /api/customers/segment/bulk-enroll
 * Enrolls a list of customers into a sequence.
 * Body: { customer_ids: string[], sequence_id: string }
 * Capped at 200 customer_ids.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { enrollCustomer } from '@/lib/sequences/enrollCustomer'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const service = createServiceClient()

  let body: { customer_ids?: unknown; sequence_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sequenceId = typeof body.sequence_id === 'string' ? body.sequence_id.trim() : ''
  if (!sequenceId) {
    return NextResponse.json({ error: 'sequence_id is required' }, { status: 400 })
  }

  if (!Array.isArray(body.customer_ids) || body.customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids must be a non-empty array' }, { status: 400 })
  }

  // Cap at 200
  const customerIds: string[] = (body.customer_ids as unknown[])
    .filter((x): x is string => typeof x === 'string')
    .slice(0, 200)

  if (customerIds.length === 0) {
    return NextResponse.json({ error: 'No valid customer_ids provided' }, { status: 400 })
  }

  // Verify sequence belongs to this org
  const { data: sequence, error: seqErr } = await service
    .from('sequences')
    .select('id, name, channel, auto_mode')
    .eq('id', sequenceId)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (seqErr || !sequence) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch sequence steps with template bodies
  const { data: steps, error: stepsErr } = await service
    .from('sequence_steps')
    .select('id, sort_order, day_offset, send_hour, template_id, template:templates(id, name, subject, body)')
    .eq('sequence_id', sequenceId)
    .order('sort_order', { ascending: true })

  if (stepsErr) {
    return NextResponse.json({ error: 'Failed to load sequence steps' }, { status: 500 })
  }

  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: 'Sequence has no steps' }, { status: 400 })
  }

  // Normalize steps to match EnrollOptions shape
  const normalizedSteps = steps.map(s => ({
    id:          s.id,
    sort_order:  s.sort_order,
    day_offset:  s.day_offset,
    send_hour:   s.send_hour,
    template_id: s.template_id,
    template:    Array.isArray(s.template) ? (s.template[0] ?? null) : (s.template ?? null),
  }))

  // Fetch only the customers that belong to this org
  const { data: customers, error: custErr } = await service
    .from('customers')
    .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms')
    .in('id', customerIds)
    .eq('user_id', profile.org_id)

  if (custErr) {
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 })
  }

  const validCustomers = customers ?? []

  let enrolled = 0
  let skipped  = 0
  let errors   = 0

  for (const customer of validCustomers) {
    // Check if already active in this sequence+channel to avoid redundant cancellation noise
    const { data: activeEnrollment } = await service
      .from('customer_sequences')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('sequence_id', sequenceId)
      .eq('org_id', profile.org_id)
      .in('status', ['active', 'paused'])
      .maybeSingle()

    if (activeEnrollment) {
      skipped++
      continue
    }

    const result = await enrollCustomer({
      supabase:  service,
      orgId:     profile.org_id,
      customer,
      sequence,
      steps:     normalizedSteps,
    })

    if (result.ok) {
      enrolled++
    } else if (result.skipped) {
      skipped++
    } else {
      errors++
    }
  }

  return NextResponse.json({ enrolled, skipped, errors })
}
