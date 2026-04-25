/** Create inventory_review tasks for vehicles that crossed 21/30/45/60-day aging thresholds today. */

import { createInventoryReviewTask } from '@/lib/tasks/auto'
import type { createServiceClient } from '@/lib/supabase/service'

const THRESHOLDS = [21, 30, 45, 60]

export async function runInventoryAging(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ vehiclesTasked: number }> {
  let vehiclesTasked = 0

  for (const days of THRESHOLDS) {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - days)
    const dayStart = new Date(targetDate)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

    const { data: agedVehicles } = await supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, user_id')
      .eq('status', 'available')
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString())

    for (const vehicle of agedVehicles ?? []) {
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_vehicle_id', vehicle.id)
        .eq('task_type', 'inventory_review')
        .eq('status', 'open')
        .maybeSingle()

      if (existingTask) continue

      await createInventoryReviewTask(
        {
          id: vehicle.id,
          stock_no: vehicle.stock_no,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
        },
        days,
        vehicle.user_id
      )
      vehiclesTasked++
    }
  }

  return { vehiclesTasked }
}
