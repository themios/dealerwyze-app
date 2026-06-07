/**
 * Auction Sync Orchestrator
 * Coordinates Copart and ACV platform syncs, deduplication, and database persistence.
 * Phase 06: Detects and logs vehicle state (new_import, price_updated, status_updated, no_change).
 */

import { createServiceClient } from '@/lib/supabase/service'
import { CopartClient } from './copartClient'
import { ACVClient } from './acvClient'
import { writeAuditLog } from '@/lib/audit/log'
import type { AuctionVehicle, AuctionSyncConfig } from './auctionTypes'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'
import { importVehicles } from '@/lib/vehicles/bulkImporter'

export class AuctionSyncOrchestrator {
  private supabase = createServiceClient()

  /**
   * Detect vehicle state: new vs. existing, price/status changes.
   * Returns state and existing vehicle record if found.
   */
  private async detectVehicleState(
    orgId: string,
    vehicle: AuctionVehicle,
  ): Promise<{
    state: 'new_import' | 'price_updated' | 'status_updated' | 'no_change'
    existing?: { id: string; price: number | null; status: string | null }
  }> {
    const query = this.supabase
      .from('vehicles')
      .select('id, price, status')
      .eq('user_id', orgId)

    // Try VIN first
    if (vehicle.vin) {
      const { data: existing } = await query.eq('vin', vehicle.vin).maybeSingle()
      if (existing) {
        // Vehicle exists by VIN; check what changed
        const priceChanged = existing.price !== (vehicle.current_bid ?? null)
        const newStatus = vehicle.primary_damage ? 'damaged' : 'unknown'
        const statusChanged = existing.status !== newStatus

        if (priceChanged && statusChanged) {
          // Both changed; prioritize price update
          return {
            state: 'price_updated',
            existing,
          }
        } else if (statusChanged) {
          return {
            state: 'status_updated',
            existing,
          }
        } else if (priceChanged) {
          return {
            state: 'price_updated',
            existing,
          }
        } else {
          return {
            state: 'no_change',
            existing,
          }
        }
      }
    }

    // Fallback: dedup by year/make/model
    const { data: existing } = await this.supabase
      .from('vehicles')
      .select('id, price, status')
      .eq('user_id', orgId)
      .eq('year', vehicle.year)
      .eq('make', vehicle.make)
      .eq('model', vehicle.model)
      .maybeSingle()

    if (existing) {
      // Matched by year/make/model; assume no_change for now (same logic as VIN match)
      return {
        state: 'no_change',
        existing,
      }
    }

    // New vehicle
    return {
      state: 'new_import',
    }
  }

  /**
   * Sync vehicles for a single org from enabled auction platforms.
   * Returns summary of imported/updated vehicles.
   *
   * Service role enforced: cron job context with no user session.
   */
  async syncOrgAuctions(config: AuctionSyncConfig): Promise<{
    total_imported: number
    total_updated: number
    errors: string[]
  }> {
    const allVehicles: AuctionVehicle[] = []
    const syncErrors: string[] = []

    try {
      // Query Copart if enabled
      if (config.copart_enabled && config.copart_api_key) {
        try {
          const copart = new CopartClient(config.copart_api_key, config.copart_username)
          const vehicles = await copart.search({ limit: 200 })
          allVehicles.push(...vehicles)
          console.log(
            `[auction-sync] Copart: fetched ${vehicles.length} vehicles for org ${config.org_id}`,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error('[auction-sync] Copart error:', msg)
          syncErrors.push(`Copart: ${msg}`)
        }
      }

      // Query ACV if enabled
      if (config.acv_enabled && config.acv_api_key) {
        try {
          const acv = new ACVClient(config.acv_api_key)
          const vehicles = await acv.search({ limit: 200 })
          allVehicles.push(...vehicles)
          console.log(`[auction-sync] ACV: fetched ${vehicles.length} vehicles for org ${config.org_id}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error('[auction-sync] ACV error:', msg)
          syncErrors.push(`ACV: ${msg}`)
        }
      }

      if (allVehicles.length === 0) {
        console.log(`[auction-sync] No vehicles fetched for org ${config.org_id}`)

        // Even with no vehicles, update sync timestamp to track "last checked"
        const updatePayload = {
          last_sync_at: new Date().toISOString(),
          last_sync_status: syncErrors.length > 0 ? 'partial' : 'success',
          last_sync_error: syncErrors.length > 0 ? syncErrors[0] : null,
          last_sync_count: 0,
        }
        await this.supabase
          .from('org_auction_sync_config')
          .update(updatePayload)
          .eq('org_id', config.org_id)

        return { total_imported: 0, total_updated: 0, errors: syncErrors }
      }

      // Analyze each vehicle before import
      const vehiclesToImport: VehicleEditState[] = []
      const stateStats = {
        new_import: 0,
        price_updated: 0,
        status_updated: 0,
        no_change: 0,
      }

      for (const av of allVehicles) {
        // Skip vehicles missing required fields
        if (!av.year || !av.make || !av.model) continue

        const stateDetection = await this.detectVehicleState(config.org_id, av)
        stateStats[stateDetection.state]++

        // Log per-vehicle state
        await writeAuditLog({
          orgId: config.org_id,
          actorId: null,
          actorType: 'user',
          action: 'auction_sync_vehicle_detected',
          entityType: 'vehicle',
          entityId: stateDetection.existing?.id ?? null,
          vehicleState: stateDetection.state,
          metadata: {
            vin: av.vin ?? null,
            auction_source: av.source,
            lot_number: av.lot_number,
            ...(stateDetection.state !== 'new_import' && {
              old_price: stateDetection.existing?.price,
              new_price: av.current_bid,
              old_status: stateDetection.existing?.status,
              new_status: av.primary_damage ? 'damaged' : 'unknown',
            }),
          },
        })

        // Only add new vehicles to import list (v1.1 scope)
        // TODO: Phase 07 will add update logic for price_updated/status_updated
        if (stateDetection.state === 'new_import') {
          vehiclesToImport.push({
            id: crypto.randomUUID(),
            selected: true,
            year: av.year!,
            make: av.make!,
            model: av.model!,
            vin: av.vin ?? undefined,
            price: av.current_bid ?? undefined,
            mileage: undefined,
            color: undefined,
            condition: av.primary_damage ? 'damaged' : 'unknown',
            acquisition_source: 'auction',
            auction_name: av.source,
            auction_lot: av.lot_number ?? undefined,
            description: av.primary_damage ? `Primary: ${av.primary_damage}` : undefined,
          })
        }
      }

      // Import new vehicles
      const importResult = vehiclesToImport.length > 0
        ? await importVehicles(config.org_id, vehiclesToImport, '', 'auction')
        : { success: 0, failed: 0, errors: [] }

      // Final summary audit log
      await writeAuditLog({
        orgId: config.org_id,
        actorId: null,
        actorType: 'user',
        action: 'auction_sync_completed',
        entityType: 'vehicle',
        entityId: null,
        metadata: {
          fetched: allVehicles.length,
          new_import: stateStats.new_import,
          price_updated: stateStats.price_updated,
          status_updated: stateStats.status_updated,
          no_change: stateStats.no_change,
          imported: importResult.success,
          failed: importResult.failed,
          sources: [...new Set(allVehicles.map((v) => v.source))],
        },
      })

      // Update sync config
      const successPayload = {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        last_sync_count: importResult.success,
      }
      await this.supabase
        .from('org_auction_sync_config')
        .update(successPayload)
        .eq('org_id', config.org_id)

      console.log(
        `[auction-sync] ${config.org_id}: new=${stateStats.new_import}, price_updated=${stateStats.price_updated}, status_updated=${stateStats.status_updated}, no_change=${stateStats.no_change}`,
      )

      return {
        total_imported: importResult.success,
        total_updated: 0, // TODO: Phase 07 will implement updates
        errors: importResult.errors.map((e) => `${e.id}: ${e.error}`),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[auction-sync] Unhandled error:', message)

      // Mark sync as failed
      const failedPayload = {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        last_sync_error: message,
      }
      await this.supabase
        .from('org_auction_sync_config')
        .update(failedPayload)
        .eq('org_id', config.org_id)

      return { total_imported: 0, total_updated: 0, errors: [message, ...syncErrors] }
    }
  }
}
