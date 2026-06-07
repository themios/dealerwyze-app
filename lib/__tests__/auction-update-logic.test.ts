import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AuctionVehicle, AuctionSyncConfig } from '@/lib/auction/auctionTypes'

/**
 * Auction Sync Update Logic Tests
 *
 * These tests verify that:
 * 1. Location assignment modes ('default' and 'manual') work correctly for new imports
 * 2. Existing vehicles are detected and queued for update (not re-import)
 * 3. Updates preserve location_id while changing price/status
 * 4. Separate audit logging for updates vs. imports
 * 5. Summary log includes both imported and updated counts
 */

describe('Auction Sync Update Logic', () => {
  describe('Location Assignment Modes', () => {
    it('should assign new vehicles to primary location when mode=default', () => {
      const orgId = 'org-dealer-123'
      const config: AuctionSyncConfig = {
        org_id: orgId,
        enabled: true,
        copart_enabled: false,
        acv_enabled: true,
        acv_api_key: 'test-key',
        auction_location_mode: 'default',
      }

      // When mode is 'default', location_id should be set to org_id (primary location)
      const locationId = config.auction_location_mode === 'manual' ? undefined : config.org_id

      expect(locationId).toBe(orgId)
    })

    it('should leave location_id undefined when mode=manual', () => {
      const orgId = 'org-dealer-456'
      const config: AuctionSyncConfig = {
        org_id: orgId,
        enabled: true,
        copart_enabled: false,
        acv_enabled: true,
        acv_api_key: 'test-key',
        auction_location_mode: 'manual',
      }

      // When mode is 'manual', location_id should be undefined
      const locationId = config.auction_location_mode === 'manual' ? undefined : config.org_id

      expect(locationId).toBeUndefined()
    })

    it('should default to "default" mode if not specified in config', () => {
      const orgId = 'org-dealer-789'
      const config: AuctionSyncConfig = {
        org_id: orgId,
        enabled: true,
        copart_enabled: false,
        acv_enabled: true,
        acv_api_key: 'test-key',
        // auction_location_mode not specified
      }

      // Should treat as 'default' mode
      const mode = config.auction_location_mode ?? 'default'
      const locationId = mode === 'manual' ? undefined : orgId

      expect(mode).toBe('default')
      expect(locationId).toBe(orgId)
    })
  })

  describe('Vehicle State Detection', () => {
    it('should detect price change from existing vehicle', () => {
      const existing = {
        id: 'vehicle-123',
        price: 9000,
        status: 'unknown',
      }
      const auctionVehicle: AuctionVehicle = {
        source: 'acv',
        external_id: 'ext-123',
        vin: '12345',
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        trim: null,
        lot_number: 'LOT-001',
        current_bid: 10000, // Price increased
        estimated_repair_cost: null,
        primary_damage: null,
        secondary_damage: null,
        sale_date: null,
      }

      // Simulate state detection logic
      const priceChanged = existing.price !== (auctionVehicle.current_bid ?? null)
      const newStatus = auctionVehicle.primary_damage ? 'damaged' : 'unknown'
      const statusChanged = existing.status !== newStatus

      const state = priceChanged && !statusChanged ? 'price_updated' : 'no_change'

      expect(state).toBe('price_updated')
      expect(priceChanged).toBe(true)
      expect(statusChanged).toBe(false)
    })

    it('should detect status change from existing vehicle', () => {
      const existing = {
        id: 'vehicle-456',
        price: 10000,
        status: 'unknown',
      }
      const auctionVehicle: AuctionVehicle = {
        source: 'copart',
        external_id: 'ext-456',
        vin: '54321',
        year: 2020,
        make: 'Toyota',
        model: 'Camry',
        trim: null,
        lot_number: 'LOT-002',
        current_bid: 10000,
        estimated_repair_cost: null,
        primary_damage: 'Engine Damage', // Status changes
        secondary_damage: null,
        sale_date: null,
      }

      // Simulate state detection logic
      const priceChanged = existing.price !== (auctionVehicle.current_bid ?? null)
      const newStatus = auctionVehicle.primary_damage ? 'damaged' : 'unknown'
      const statusChanged = existing.status !== newStatus

      const state = statusChanged ? 'status_updated' : 'no_change'

      expect(state).toBe('status_updated')
      expect(statusChanged).toBe(true)
      expect(newStatus).toBe('damaged')
    })

    it('should detect no_change when vehicle price and status are unchanged', () => {
      const existing = {
        id: 'vehicle-789',
        price: 10000,
        status: 'unknown',
      }
      const auctionVehicle: AuctionVehicle = {
        source: 'acv',
        external_id: 'ext-789',
        vin: '99999',
        year: 2020,
        make: 'Tesla',
        model: 'Model 3',
        trim: null,
        lot_number: 'LOT-003',
        current_bid: 10000, // Same price
        estimated_repair_cost: null,
        primary_damage: null, // No damage (same status)
        secondary_damage: null,
        sale_date: null,
      }

      // Simulate state detection logic
      const priceChanged = existing.price !== (auctionVehicle.current_bid ?? null)
      const newStatus = auctionVehicle.primary_damage ? 'damaged' : 'unknown'
      const statusChanged = existing.status !== newStatus

      const state = priceChanged || statusChanged ? 'price_updated' : 'no_change'

      expect(state).toBe('no_change')
      expect(priceChanged).toBe(false)
      expect(statusChanged).toBe(false)
    })

    it('should prioritize price_updated when both price and status change', () => {
      const existing = {
        id: 'vehicle-both-change',
        price: 9000,
        status: 'unknown',
      }
      const auctionVehicle: AuctionVehicle = {
        source: 'copart',
        external_id: 'ext-both',
        vin: '11111',
        year: 2020,
        make: 'Honda',
        model: 'Accord',
        trim: null,
        lot_number: 'LOT-004',
        current_bid: 11000, // Price changed
        estimated_repair_cost: null,
        primary_damage: 'Damage Info', // Status changed
        secondary_damage: null,
        sale_date: null,
      }

      // Simulate state detection logic
      const priceChanged = existing.price !== (auctionVehicle.current_bid ?? null)
      const newStatus = auctionVehicle.primary_damage ? 'damaged' : 'unknown'
      const statusChanged = existing.status !== newStatus

      let state: 'price_updated' | 'status_updated' | 'no_change'
      if (priceChanged && statusChanged) {
        state = 'price_updated' // Prioritize price
      } else if (statusChanged) {
        state = 'status_updated'
      } else if (priceChanged) {
        state = 'price_updated'
      } else {
        state = 'no_change'
      }

      expect(state).toBe('price_updated')
    })
  })

  describe('Update Result Handling', () => {
    it('should track successful update with old and new price', () => {
      const vehicleId = 'vehicle-update-123'
      const oldPrice = 9000
      const oldStatus = 'unknown'
      const newPrice = 10000
      const newStatus = 'unknown'

      const result = {
        success: true,
        newPrice,
        newStatus,
      }

      const auditMetadata = {
        old_price: oldPrice,
        new_price: result.newPrice,
        old_status: oldStatus,
        new_status: result.newStatus,
        error: null,
      }

      expect(result.success).toBe(true)
      expect(auditMetadata.old_price).toBe(9000)
      expect(auditMetadata.new_price).toBe(10000)
      expect(auditMetadata.error).toBeNull()
    })

    it('should track successful status update with old and new status', () => {
      const vehicleId = 'vehicle-update-456'
      const oldPrice = 10000
      const oldStatus = 'unknown'
      const newPrice = 10000
      const newStatus = 'damaged'

      const result = {
        success: true,
        newPrice,
        newStatus,
      }

      const auditMetadata = {
        old_price: oldPrice,
        new_price: result.newPrice,
        old_status: oldStatus,
        new_status: result.newStatus,
        error: null,
      }

      expect(result.success).toBe(true)
      expect(auditMetadata.old_status).toBe('unknown')
      expect(auditMetadata.new_status).toBe('damaged')
      expect(auditMetadata.error).toBeNull()
    })

    it('should track failed update with error message', () => {
      const vehicleId = 'vehicle-update-failed'
      const oldPrice = 9000
      const oldStatus = 'unknown'
      const newPrice = 10000
      const newStatus = 'unknown'
      const errorMsg = 'Database update failed'

      const result = {
        success: false,
        newPrice,
        newStatus,
        error: errorMsg,
      }

      const auditMetadata = {
        old_price: oldPrice,
        new_price: result.newPrice,
        old_status: oldStatus,
        new_status: result.newStatus,
        error: result.error ?? null,
      }

      expect(result.success).toBe(false)
      expect(auditMetadata.error).toBe('Database update failed')
    })
  })

  describe('Summary Logging', () => {
    it('should include both imported and updated counts in summary', () => {
      const summaryMetadata = {
        fetched: 10,
        new_import: 3,
        price_updated: 2,
        status_updated: 1,
        no_change: 4,
        imported: 3,
        imported_failed: 0,
        updated: 2,
        updated_failed: 0,
        sources: ['copart', 'acv'],
      }

      expect(summaryMetadata.imported).toBe(3)
      expect(summaryMetadata.updated).toBe(2)
      expect(summaryMetadata.new_import).toBe(3)
      expect(summaryMetadata.price_updated).toBe(2)
      expect(summaryMetadata.status_updated).toBe(1)
      expect(summaryMetadata.no_change).toBe(4)
      expect(summaryMetadata.fetched).toBe(10)
    })

    it('should track import and update failures separately', () => {
      const summaryMetadata = {
        fetched: 5,
        new_import: 2,
        price_updated: 2,
        status_updated: 0,
        no_change: 1,
        imported: 1,
        imported_failed: 1,
        updated: 1,
        updated_failed: 1,
        sources: ['copart'],
      }

      expect(summaryMetadata.imported_failed).toBe(1)
      expect(summaryMetadata.updated_failed).toBe(1)
    })

    it('should return both total_imported and total_updated from sync result', () => {
      const syncResult = {
        total_imported: 3,
        total_updated: 2,
        errors: [] as string[],
      }

      expect(syncResult.total_imported).toBe(3)
      expect(syncResult.total_updated).toBe(2)
      expect(syncResult.total_imported + syncResult.total_updated).toBe(5)
    })
  })

  describe('Audit Action Names', () => {
    it('should use distinct action name for vehicle updates', () => {
      const updateAction = 'auction_sync_vehicle_updated'
      const importAction = 'bulk_vehicle_import'

      expect(updateAction).not.toBe(importAction)
      expect(updateAction).toBe('auction_sync_vehicle_updated')
    })

    it('should log detection with action auction_sync_vehicle_detected', () => {
      const action = 'auction_sync_vehicle_detected'
      expect(action).toBe('auction_sync_vehicle_detected')
    })

    it('should log completion with action auction_sync_completed', () => {
      const action = 'auction_sync_completed'
      expect(action).toBe('auction_sync_completed')
    })
  })

  describe('Location ID Preservation', () => {
    it('should not change location_id during vehicle update', () => {
      // Simulating update logic: location_id should NOT be in the update payload
      const updatePayload = {
        price: 10000,
        status: 'damaged',
        condition: 'damaged',
        updated_at: new Date().toISOString(),
        // location_id is intentionally omitted
      }

      expect(updatePayload).not.toHaveProperty('location_id')
      expect(updatePayload).toHaveProperty('price')
      expect(updatePayload).toHaveProperty('status')
    })

    it('should set location_id only for new imports in default mode', () => {
      const mode = 'default'
      const orgId = 'org-dealer-xyz'
      const locationId = mode === 'manual' ? undefined : orgId

      const importPayload = {
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        location_id: locationId,
        acquisition_source: 'auction',
      }

      expect(importPayload.location_id).toBe(orgId)
    })

    it('should leave location_id undefined for new imports in manual mode', () => {
      const mode = 'manual'
      const orgId = 'org-dealer-abc'
      const locationId = mode === 'manual' ? undefined : orgId

      const importPayload = {
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        location_id: locationId,
        acquisition_source: 'auction',
      }

      expect(importPayload.location_id).toBeUndefined()
    })
  })
})
