/** Create inventory_review tasks for vehicles that crossed 21/30/45/60-day aging thresholds today. */

import { createInventoryReviewTask } from '@/lib/tasks/auto'
import type { createServiceClient } from '@/lib/supabase/service'

const THRESHOLDS = [21, 30, 45, 60]

export async function runInventoryAging(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ vehiclesTasked: number }> {
  try {
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

    // Batch-load all existing open inventory_review tasks for these vehicles
    // to avoid N+1 (one DB call per vehicle)
    const vehicleIds = agedVehicles?.map(v => v.id) ?? []
    const { data: existingTaskRows } = vehicleIds.length > 0
      ? await supabase
          .from('tasks')
          .select('linked_vehicle_id')
          .eq('task_type', 'inventory_review')
          .eq('status', 'open')
          .in('linked_vehicle_id', vehicleIds)
      : { data: [] }
    const hasExistingTask = new Set(existingTaskRows?.map(t => t.linked_vehicle_id) ?? [])

    for (const vehicle of agedVehicles ?? []) {
      if (hasExistingTask.has(vehicle.id)) continue

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
  } catch (err) {
    console.error('[inventoryAging] unhandled error:', err)
    throw err
  }
}
