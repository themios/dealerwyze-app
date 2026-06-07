/**
 * Auction Sync Cron Job
 * Runs every 6 hours to pull vehicles from enabled auction platforms.
 * Iterates all orgs with auction sync enabled.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { AuctionSyncOrchestrator } from '@/lib/auction/syncOrchestrator'
import type { AuctionSyncConfig } from '@/lib/auction/auctionTypes'

export async function runAuctionSync() {
  const supabase = createServiceClient()
  const orchestrator = new AuctionSyncOrchestrator()

  try {
    // Fetch all orgs with auction sync enabled
    // Service role: needed for cross-org query
    const { data: configs, error } = await supabase
      .from('org_auction_sync_config')
      .select('*')
      .eq('enabled', true)

    if (error) {
      console.error('[auction-sync] Failed to fetch configs:', error.message)
      throw error
    }

    if (!configs || configs.length === 0) {
      console.log('[auction-sync] No orgs with auction sync enabled')
      return { success: true, processed: 0, imported: 0, failed: 0 }
    }

    console.log(`[auction-sync] Processing ${configs.length} orgs`)

    const results = await Promise.all(
      configs.map(async (config: AuctionSyncConfig) => {
        try {
          // Query org_settings for auction_location_mode
          const { data: settings } = await supabase
            .from('org_settings')
            .select('auction_location_mode')
            .eq('org_id', config.org_id)
            .maybeSingle()

          // Add location mode to config
          const configWithMode: AuctionSyncConfig = {
            ...config,
            auction_location_mode: settings?.auction_location_mode ?? 'default',
          }

          const result = await orchestrator.syncOrgAuctions(configWithMode)
          return { org_id: config.org_id, ...result }
        } catch (err) {
          console.error(`[auction-sync] Error syncing ${config.org_id}:`, err)
          return {
            org_id: config.org_id,
            total_imported: 0,
            total_updated: 0,
            errors: [err instanceof Error ? err.message : 'Unknown error'],
          }
        }
      }),
    )

    const totalImported = results.reduce((sum, r) => sum + r.total_imported, 0)
    const totalFailed = results.filter((r) => r.errors.length > 0).length

    console.log(
      `[auction-sync] Completed: ${results.length} orgs, ${totalImported} vehicles imported, ${totalFailed} with errors`,
    )

    return { success: true, processed: results.length, imported: totalImported, failed: totalFailed }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[auction-sync] Fatal error:', message)
    throw err
  }
}
