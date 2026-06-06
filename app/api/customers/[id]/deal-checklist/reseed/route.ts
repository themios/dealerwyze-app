import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

// Real estate transaction checklist
const RE_CHECKLIST_ITEMS = [
  { title: 'Property inspection ordered', priority: 'must' },
  { title: 'Appraisal ordered', priority: 'must' },
  { title: 'Title search initiated', priority: 'must' },
  { title: 'Mortgage pre-approval obtained', priority: 'must' },
  { title: 'Purchase agreement signed', priority: 'must' },
  { title: 'Earnest money deposit submitted', priority: 'must' },
  { title: 'HOA documents reviewed (if applicable)', priority: 'should' },
  { title: 'Financing documents from lender', priority: 'must' },
  { title: 'Final walkthrough completed', priority: 'must' },
  { title: 'Closing disclosure reviewed', priority: 'must' },
  { title: 'Title insurance policy issued', priority: 'must' },
  { title: 'Closing day documents signed', priority: 'must' },
  { title: 'Deed recorded at county', priority: 'must' },
  { title: 'Keys handed over to buyer', priority: 'must' },
  { title: 'Post-sale congratulations sent', priority: 'should' },
  { title: 'Files & documents organized', priority: 'should' },
]

// Auto dealer transaction checklist
const DEALER_CHECKLIST_ITEMS = [
  { title: "Driver's license (copy on file)", priority: 'must' },
  { title: 'Proof of insurance', priority: 'must' },
  { title: 'Proof of income (paystubs / bank statements)', priority: 'must' },
  { title: 'Proof of residence (utility bill / lease agreement)', priority: 'must' },
  { title: 'References collected (name + phone x2)', priority: 'should' },
  { title: 'SSN or ITIN on file', priority: 'should' },
  { title: 'Buyer order / bill of sale signed', priority: 'must' },
  { title: 'Retail installment contract signed (if financing)', priority: 'must' },
  { title: 'Down payment collected', priority: 'must' },
  { title: 'Title signed over to buyer', priority: 'must' },
  { title: 'Dealer temp tag issued', priority: 'must' },
  { title: 'DMV paperwork submitted', priority: 'must' },
  { title: 'BHPH payment schedule set up', priority: 'should' },
  { title: 'Post-sale thank you sent', priority: 'should' },
  { title: 'Deal jacket filed / docs scanned', priority: 'should' },
]

/**
 * POST /api/customers/[id]/deal-checklist/reseed
 *
 * Reseed the deal checklist with correct vertical-aware items.
 * Deletes existing checklist and recreates with correct items.
 * Useful when vertical changes or to fix incorrectly-seeded checklists.
 */
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

  if (!customer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Get org vertical
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  const isRealEstate = org?.vertical === 'real_estate'
  const checklistItems = isRealEstate ? RE_CHECKLIST_ITEMS : DEALER_CHECKLIST_ITEMS

  // Delete existing checklist items
  await supabase
    .from('tasks')
    .delete()
    .eq('user_id', profile.org_id)
    .eq('linked_customer_id', id)
    .eq('task_type', 'deal_checklist')

  // Create new items
  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString()
  const rows = checklistItems.map(item => ({
    user_id: profile.org_id,
    linked_customer_id: id,
    task_type: 'deal_checklist',
    title: item.title,
    priority: item.priority,
    status: 'open',
    due_at: dueDate,
    auto_generated: true,
  }))

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) {
    return NextResponse.json(
      { error: 'Failed to reseed checklist' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    reseeded: true,
    vertical: isRealEstate ? 'real_estate' : 'dealer',
    item_count: checklistItems.length,
  })
}
