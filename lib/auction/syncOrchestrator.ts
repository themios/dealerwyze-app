/**
 * Auction Sync Orchestrator
 * Coordinates Copart and ACV platform syncs, deduplication, and database persistence.
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

      // Convert auction vehicles to importable format
      // Filter out vehicles missing required fields (year, make, model)
      const vehiclesToImport = allVehicles
        .filter((av: AuctionVehicle): boolean => Boolean(av.year && av.make && av.model))
        .map((av): VehicleEditState => ({
          id: crypto.randomUUID(),
          selected: true,
          year: av.year!,
          make: av.make!,
          model: av.model!,
          vin: av.vin ?? undefined,
          price: av.current_bid ?? undefined,
          mileage: undefined, // Auctions don't provide mileage
          color: undefined,
          condition: av.primary_damage ? 'damaged' : 'unknown',
          acquisition_source: 'auction',
          auction_name: av.source,
          auction_lot: av.lot_number ?? undefined,
          description: av.primary_damage ? `Primary: ${av.primary_damage}` : undefined,
        }))

      // Persist to database (dedup by VIN, fallback by year/make/model)
      // Service role: no user session; caller is cron job
      // Cron jobs have no user_id context, so we pass empty string
      const importResult = await importVehicles(config.org_id, vehiclesToImport, '')

      // Update sync config with result
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
        `[auction-sync] ${config.org_id}: imported ${importResult.success}, failed ${importResult.failed}`,
      )

      // Audit log: record sync completion (cron job, so actorId is null)
      await writeAuditLog({
        orgId: config.org_id,
        actorId: null,
        actorType: 'user',
        action: 'auction_sync_completed',
        entityType: 'vehicle',
        entityId: null,
        metadata: {
          imported: importResult.success,
          failed: importResult.failed,
          sources: [...new Set(allVehicles.map((v) => v.source))],
        },
      })

      return {
        total_imported: importResult.success,
        total_updated: 0, // TODO: implement update logic in Plan 05
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
