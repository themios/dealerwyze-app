/**
 * GET /api/customers/[id]/deal-checklist
 *   Returns all deal_checklist tasks for this customer.
 *
 * POST /api/customers/[id]/deal-checklist
 *   Seeds the standard deal checklist for this customer (idempotent).
 *
 * PATCH /api/customers/[id]/deal-checklist
 *   { task_id, status } — toggle a checklist item open/done.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

const STANDARD_ITEMS = [
  { title: 'Collect signed bill of sale',         priority: 'must'   },
  { title: 'Obtain title from seller / lender',   priority: 'must'   },
  { title: 'Sign title over to buyer',            priority: 'must'   },
  { title: 'Collect down payment / full payment', priority: 'must'   },
  { title: 'Issue dealer temp tag',               priority: 'must'   },
  { title: 'Submit DMV paperwork',                priority: 'must'   },
  { title: 'Verify insurance on file',            priority: 'should' },
  { title: 'Send post-sale thank you',            priority: 'should' },
  { title: 'File deal jacket / scan docs',        priority: 'should' },
  { title: 'Set BHPH payment schedule (if applicable)', priority: 'should' },
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_at, notes, completed_at, created_at')
    .eq('user_id', profile.org_id)
    .eq('linked_customer_id', id)
    .eq('task_type', 'deal_checklist')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load checklist' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = createServiceClient()

  // Verify customer belongs to org
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if already seeded (idempotent)
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', profile.org_id)
    .eq('linked_customer_id', id)
    .eq('task_type', 'deal_checklist')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ seeded: false, message: 'Checklist already exists' })
  }

  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString()
  const rows = STANDARD_ITEMS.map(item => ({
    user_id:           profile.org_id,
    linked_customer_id: id,
    task_type:         'deal_checklist',
    title:             item.title,
    priority:          item.priority,
    status:            'open',
    due_at:            dueDate,
    auto_generated:    true,
  }))

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) return NextResponse.json({ error: 'Failed to create checklist' }, { status: 500 })

  return NextResponse.json({ seeded: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = createServiceClient()
  const body: { task_id: string; status: 'open' | 'done' } = await req.json()

  if (!body.task_id || !['open', 'done'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Verify task belongs to org + customer
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', body.task_id)
    .eq('user_id', profile.org_id)
    .eq('linked_customer_id', id)
    .eq('task_type', 'deal_checklist')
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase
    .from('tasks')
    .update({
      status:       body.status,
      completed_at: body.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', body.task_id)

  return NextResponse.json({ ok: true })
}
