/** Find draft_ready receipts older than 6 hours and create receipt_review tasks if none exist. */

import { createReceiptReviewTask } from '@/lib/tasks/auto'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runReceiptTasks(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ receiptsTasked: number }> {
  let receiptsTasked = 0

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  const { data: staleReceipts } = await supabase
    .from('receipts')
    .select('id, vendor_norm, vendor_raw, total, user_id')
    .eq('status', 'draft_ready')
    .lt('created_at', sixHoursAgo)

  for (const receipt of staleReceipts ?? []) {
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_receipt_id', receipt.id)
      .eq('task_type', 'receipt_review')
      .eq('status', 'open')
      .maybeSingle()

    if (existingTask) continue

    await createReceiptReviewTask(
      receipt.id,
      receipt.vendor_norm ?? receipt.vendor_raw,
      receipt.total,
      receipt.user_id
    )
    receiptsTasked++
  }

  return { receiptsTasked }
}
