import { createServiceClient } from '@/lib/supabase/service'

/**
 * Called immediately when a new inbound lead activity is created.
 * Creates a lead_response task due in 10 minutes (priority=must).
 * Deduplicates: skips if an open lead_response task already exists for this customer.
 */
export async function createLeadResponseTask(
  customerId: string,
  customerName: string | null,
  vehicleName: string | null,
  vehicleId: string | null,
  userId: string
): Promise<void> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('linked_customer_id', customerId)
    .eq('task_type', 'lead_response')
    .eq('status', 'open')
    .maybeSingle()

  if (existing) return

  const nameLabel    = customerName ?? 'New Lead'
  const vehicleLabel = vehicleName  ? ` · ${vehicleName}` : ''
  const dueAt        = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabase.from('tasks').insert({
    user_id: userId,
    title: `${nameLabel}${vehicleLabel}`,
    task_type: 'lead_response',
    status: 'open',
    priority: 'must',
    due_at: dueAt,
    auto_generated: true,
    source_event: 'lead_created',
    linked_customer_id: customerId,
    linked_vehicle_id: vehicleId,
  })
}

export async function createReceiptReviewTask(
  receiptId: string,
  vendorName: string | null,
  total: number | null,
  userId: string
): Promise<void> {
  const supabase = createServiceClient()

  // Skip if an open receipt_review task already exists for this receipt
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('linked_receipt_id', receiptId)
    .eq('task_type', 'receipt_review')
    .eq('status', 'open')
    .maybeSingle()

  if (existing) return

  const vendorLabel = vendorName ?? 'Unknown vendor'
  const title =
    total != null
      ? `Post receipt: ${vendorLabel} · $${total.toFixed(2)}`
      : `Post receipt: ${vendorLabel}`

  await supabase.from('tasks').insert({
    user_id: userId,
    title,
    task_type: 'receipt_review',
    status: 'open',
    priority: 'should',
    due_at: new Date().toISOString(),
    auto_generated: true,
    source_event: 'receipt_draft_timeout',
    linked_receipt_id: receiptId,
  })
}

export async function createInventoryReviewTask(
  vehicle: { id: string; stock_no: string; year: number; make: string; model: string },
  days: number,
  userId: string
): Promise<void> {
  const supabase = createServiceClient()

  // Skip if an open inventory_review task already exists for this vehicle
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('linked_vehicle_id', vehicle.id)
    .eq('task_type', 'inventory_review')
    .eq('status', 'open')
    .maybeSingle()

  if (existing) return

  const title = `Review ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock_no}) — ${days} days`
  const priority = days >= 45 ? 'must' : 'should'

  await supabase.from('tasks').insert({
    user_id: userId,
    title,
    task_type: 'inventory_review',
    status: 'open',
    priority,
    due_at: new Date().toISOString(),
    auto_generated: true,
    source_event: `vehicle_aged_${days}_days`,
    linked_vehicle_id: vehicle.id,
  })
}
