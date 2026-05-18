import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'open'
  const dueFrom = searchParams.get('due_from')
  const dueTo = searchParams.get('due_to')

  let query = supabase
    .from('tasks')
    .select(`
      *,
      vehicles:linked_vehicle_id(stock_no, year, make, model),
      receipts:linked_receipt_id(vendor_norm, vendor_raw, total),
      customers:linked_customer_id(name, primary_phone, archived)
    `)
    .eq('user_id', profile.org_id)
    .eq('status', status)

  if (dueFrom) query = query.gte('due_at', dueFrom)
  if (dueTo) query = query.lte('due_at', dueTo)

  // priority desc (must=must, should=should — order alphabetically DESC puts 'should' before 'must',
  // so use explicit case ordering via raw: must first)
  // Supabase doesn't support CASE in order, so we fetch and sort in JS for must-first ordering.
  const { data: tasks, error } = await query
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(100)

  if (error) {
    console.error('[tasks GET]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Filter out tasks whose linked customer has been archived (belt-and-suspenders;
  // archiving a customer now auto-completes their tasks, but guards legacy records)
  const active = (tasks ?? []).filter((t: Record<string, unknown>) => {
    const c = t.customers as { archived?: boolean } | null
    return !c?.archived
  })

  // Sort: 'must' before 'should', then preserve due_at asc order within each group
  const sorted = active.sort((a, b) => {
    if (a.priority === b.priority) return 0
    return a.priority === 'must' ? -1 : 1
  })

  // Attach assigned_to_name via profiles lookup
  const assigneeIds = [...new Set(sorted.map((t: Record<string, unknown>) => t.assigned_to_user_id as string).filter(Boolean))]
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', assigneeIds)
    const nameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
    sorted.forEach((t: Record<string, unknown>) => {
      const uid = t.assigned_to_user_id as string | null
      t.assigned_to_name = uid ? (nameMap[uid] ?? null) : null
    })
  }

  return NextResponse.json({ tasks: sorted })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    title: string
    task_type?: string
    priority?: string
    due_at?: string
    linked_vehicle_id?: string
    linked_customer_id?: string
    linked_receipt_id?: string
    notes?: string
    assigned_to_user_id?: string | null
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      user_id: profile.org_id,
      title: body.title.trim(),
      task_type: body.task_type ?? 'manual',
      priority: body.priority ?? 'should',
      due_at: body.due_at ?? null,
      linked_vehicle_id: body.linked_vehicle_id ?? null,
      linked_customer_id: body.linked_customer_id ?? null,
      linked_receipt_id: body.linked_receipt_id ?? null,
      notes: body.notes ?? null,
      assigned_to_user_id: body.assigned_to_user_id ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[tasks POST]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ task }, { status: 201 })
}
