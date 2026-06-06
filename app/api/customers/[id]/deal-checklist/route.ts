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
import { createClient } from '@/lib/supabase/server'

// Real estate transaction checklist
const RE_CHECKLIST_ITEMS = [
  // Pre-offer
  { title: 'Property inspection ordered',                              priority: 'must'   },
  { title: 'Appraisal ordered',                                        priority: 'must'   },
  { title: 'Title search initiated',                                   priority: 'must'   },
  { title: 'Mortgage pre-approval obtained',                           priority: 'must'   },
  // Offer & acceptance
  { title: 'Purchase agreement signed',                                priority: 'must'   },
  { title: 'Earnest money deposit submitted',                          priority: 'must'   },
  { title: 'HOA documents reviewed (if applicable)',                   priority: 'should' },
  // Underwriting & financing
  { title: 'Financing documents from lender',                          priority: 'must'   },
  { title: 'Final walkthrough completed',                              priority: 'must'   },
  { title: 'Closing disclosure reviewed',                              priority: 'must'   },
  { title: 'Title insurance policy issued',                            priority: 'must'   },
  // Closing
  { title: 'Closing day documents signed',                             priority: 'must'   },
  { title: 'Deed recorded at county',                                  priority: 'must'   },
  { title: 'Keys handed over to buyer',                                priority: 'must'   },
  // Post-closing
  { title: 'Post-sale congratulations sent',                           priority: 'should' },
  { title: 'Files & documents organized',                              priority: 'should' },
]

// Auto dealer transaction checklist
const DEALER_CHECKLIST_ITEMS = [
  // Customer docs
  { title: "Driver's license (copy on file)",                          priority: 'must'   },
  { title: 'Proof of insurance',                                       priority: 'must'   },
  { title: 'Proof of income (paystubs / bank statements)',             priority: 'must'   },
  { title: 'Proof of residence (utility bill / lease agreement)',      priority: 'must'   },
  { title: 'References collected (name + phone x2)',                   priority: 'should' },
  { title: 'SSN or ITIN on file',                                      priority: 'should' },
  // Deal paperwork
  { title: 'Buyer order / bill of sale signed',                        priority: 'must'   },
  { title: 'Retail installment contract signed (if financing)',        priority: 'must'   },
  { title: 'Down payment collected',                                   priority: 'must'   },
  { title: 'Title signed over to buyer',                               priority: 'must'   },
  { title: 'Dealer temp tag issued',                                   priority: 'must'   },
  { title: 'DMV paperwork submitted',                                  priority: 'must'   },
  // BHPH / post-sale
  { title: 'BHPH payment schedule set up',                             priority: 'should' },
  { title: 'Post-sale thank you sent',                                 priority: 'should' },
  { title: 'Deal jacket filed / docs scanned',                         priority: 'should' },
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

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
  const supabase = await createClient()

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

  // Get org vertical to select appropriate checklist
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  const isRealEstate = org?.vertical === 'real_estate'
  const checklistItems = isRealEstate ? RE_CHECKLIST_ITEMS : DEALER_CHECKLIST_ITEMS

  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString()
  const rows = checklistItems.map(item => ({
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
  const supabase = await createClient()
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
