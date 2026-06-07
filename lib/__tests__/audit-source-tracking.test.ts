import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importVehicles } from '@/lib/vehicles/bulkImporter'
import { makeTestClient } from './helpers/testClient'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'

const { supabase } = makeTestClient()

const { mockWriteAuditLog } = vi.hoisted(() => ({
  mockWriteAuditLog: vi.fn(),
}))

vi.mock('@/lib/audit/log', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

describe('Audit Source Tracking', () => {
  const orgId = 'test-org-id'
  const userId = 'test-user-id'

  const sampleItems: VehicleEditState[] = [
    {
      id: 'item-1',
      selected: true,
      year: 2020,
      make: 'Honda',
      model: 'Civic',
    },
    {
      id: 'item-2',
      selected: true,
      year: 2021,
      make: 'Toyota',
      model: 'Camry',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful vehicle inserts
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'dealer_locations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'loc-1' }],
            error: null,
          }),
        } as never
      }
      if (table === 'vehicles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
          insert: vi.fn().mockResolvedValue({
            error: null,
          }),
        } as never
      }
      return {} as never
    })
  })

  it('logs paste imports with source: "paste"', async () => {
    await importVehicles(orgId, sampleItems, userId, 'paste')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'bulk_vehicle_import',
        source: 'paste',
        orgId,
        actorId: userId,
        metadata: expect.objectContaining({
          count: 2,
          success: expect.any(Number),
          failed: expect.any(Number),
        }),
      })
    )
  })

  it('logs csv imports with source: "csv"', async () => {
    await importVehicles(orgId, sampleItems, userId, 'csv')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'bulk_vehicle_import',
        source: 'csv',
        orgId,
        actorId: userId,
        metadata: expect.objectContaining({
          count: 2,
          success: expect.any(Number),
          failed: expect.any(Number),
        }),
      })
    )
  })

  it('logs auction imports with source: "auction"', async () => {
    await importVehicles(orgId, sampleItems, userId, 'auction')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'bulk_vehicle_import',
        source: 'auction',
        orgId,
        actorId: userId,
        metadata: expect.objectContaining({
          count: 2,
          success: expect.any(Number),
          failed: expect.any(Number),
        }),
      })
    )
  })

  it('includes success/failed counts in metadata for all sources', async () => {
    const sources: Array<'paste' | 'csv' | 'auction'> = ['paste', 'csv', 'auction']

    for (const source of sources) {
      vi.clearAllMocks()
      await importVehicles(orgId, sampleItems, userId, source)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          source,
          action: 'bulk_vehicle_import',
          metadata: expect.objectContaining({
            count: expect.any(Number),
            success: expect.any(Number),
            failed: expect.any(Number),
          }),
        })
      )
    }
  })

  it('passes correct source parameter from importVehicles to writeAuditLog', async () => {
    const testCases = [
      { source: 'paste' as const, name: 'paste imports' },
      { source: 'csv' as const, name: 'CSV imports' },
      { source: 'auction' as const, name: 'auction imports' },
    ]

    for (const testCase of testCases) {
      vi.clearAllMocks()
      await importVehicles(orgId, [sampleItems[0]], userId, testCase.source)

      const call = vi.mocked(mockWriteAuditLog).mock.calls[0]?.[0]
      expect(call?.source).toBe(testCase.source)
    }
  })
})
