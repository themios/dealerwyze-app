/**
 * Bulk vehicle import utility.
 * Handles persistence to database with VIN deduplication and multi-location assignment.
 */

import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'
import type { VehicleEditState } from './extractionTypes'

export interface BulkImportResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

export async function importVehicles(
  orgId: string,
  items: VehicleEditState[],
  userId: string,
): Promise<BulkImportResult> {
  const supabase = await createClient()
  const results: BulkImportResult = {
    success: 0,
    failed: 0,
    errors: [],
  }

  // Get org's location info for multi-location assignment
  const { data: locations } = await supabase
    .from('dealer_locations')
    .select('id')
    .eq('dealer_id', orgId)
    .order('created_at', { ascending: true })

  const defaultLocationId = locations?.[0]?.id || null

  // Batch insert with dedup check
  for (const item of items) {
    try {
      // Check for duplicate by VIN (primary dedup key)
      let query = supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', orgId)

      if (item.vin) {
        query = query.eq('vin', item.vin.toUpperCase())
      } else {
        // If no VIN, try to dedup by (year, make, model, price)
        query = query
          .eq('year', item.year)
          .eq('make', item.make)
          .eq('model', item.model)
          .eq('price', item.price ?? null)
      }

      const { data: existing, error: queryError } = await query.maybeSingle()

      if (!queryError && existing) {
        // Duplicate found
        results.failed++
        results.errors.push({
          id: item.id,
          error: item.vin ? `Duplicate VIN: ${item.vin}` : `Duplicate: ${item.year} ${item.make} ${item.model}`,
        })
        continue
      }

      // Prepare vehicle record
      const vehicleRecord = {
        user_id: orgId,
        stock_no: generateStockNo(),
        vin: item.vin?.toUpperCase() || null,
        year: item.year,
        make: item.make,
        model: item.model,
        price: item.price || null,
        mileage: item.mileage || null,
        color: item.color || null,
        condition: item.condition || null,
        status: 'available' as const,
        notes: item.description || null,
        location_id: item.location_id || defaultLocationId,
        created_at: new Date().toISOString(),
      }

      // Insert new vehicle
      const { error: insertError } = await supabase.from('vehicles').insert(vehicleRecord)

      if (insertError) throw insertError

      results.success++
    } catch (err) {
      results.failed++
      results.errors.push({
        id: item.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // Audit log
  await writeAuditLog({
    orgId,
    action: 'bulk_vehicle_import',
    entityType: 'vehicle',
    entityId: null,
    actorType: 'user',
    actorId: userId,
    metadata: {
      count: items.length,
      success: results.success,
      failed: results.failed,
    },
  })

  return results
}

function generateStockNo(): string {
  // Simple stock number generator: date + random
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${date}-${random}`
}
