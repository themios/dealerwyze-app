import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { TEST_ORG_ID, TEST_USER_ID } from './helpers/testClient'

// Mock all dependencies before importing route handlers
const { mockRequireProfile } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
}))

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

const { mockWriteAuditLog } = vi.hoisted(() => ({
  mockWriteAuditLog: vi.fn(),
}))

const { mockOrgCsvImportLimiter } = vi.hoisted(() => ({
  mockOrgCsvImportLimiter: vi.fn(async () => ({ allowed: true })),
}))

const { mockOrgBulkExtractLimiter } = vi.hoisted(() => ({
  mockOrgBulkExtractLimiter: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/audit/log', () => ({
  writeAuditLog: mockWriteAuditLog,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  orgCsvImportLimiter: mockOrgCsvImportLimiter,
  orgBulkExtractLimiter: mockOrgBulkExtractLimiter,
}))

describe('Vertical Enforcement', () => {
  const dealerOrgId = 'org-dealer-123'
  const reOrgId = 'org-re-456'
  const userId = 'user-789'

  const dealerProfile = {
    id: userId,
    org_id: dealerOrgId,
    display_name: 'Dealer Rep',
    role: 'dealer_admin' as const,
  }

  const reProfile = {
    id: userId,
    org_id: reOrgId,
    display_name: 'RE Agent',
    role: 'agent_admin' as const,
  }

  function createMockSupabaseClient(vertical: string | null = 'dealer', hasError = false) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: vertical ? { vertical } : null,
              error: hasError ? 'Not found' : null,
            }),
          }),
        }),
      }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOrgCsvImportLimiter.mockResolvedValue({ allowed: true })
    mockOrgBulkExtractLimiter.mockResolvedValue({ allowed: true })
  })

  describe('CSV Import Endpoint (/api/vehicles/import)', () => {
    it('rejects RealtyWyze org (vertical=real_estate) with 403 error', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
      })

      const response = await POST(req)
      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('not available for your organization type'),
        })
      )

      // Verify audit log was written
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_csv_import',
          orgId: reOrgId,
          actorId: userId,
          actorType: 'user',
          entityType: 'vehicle',
          metadata: expect.objectContaining({
            org_vertical: 'real_estate',
            reason: 'CSV import restricted to dealer vertical',
          }),
        })
      )
    })

    it('allows dealer org (vertical=dealer) to proceed', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('dealer'))

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
        body: new FormData(),
      })

      // The actual file validation will fail since no file is present,
      // but we should not get a vertical violation error
      const response = await POST(req)

      // Should fail for missing file, not for vertical mismatch
      expect(response.status).not.toBe(403)

      // Audit log should NOT be called for vertical violations on allowed orgs
      expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_csv_import',
        })
      )
    })

    it('returns 404 when organization not found', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient(null, true))

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
      })

      const response = await POST(req)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toContain('Organization not found')
    })

    it('respects rate limit before vertical check', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockOrgCsvImportLimiter.mockResolvedValueOnce({ allowed: false })

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
      })

      const response = await POST(req)
      expect(response.status).toBe(429)
      expect(mockCreateClient).not.toHaveBeenCalled()
    })
  })

  describe('Monroney Extract Endpoint (/api/vehicles/intake/monroney-extract)', () => {
    it('rejects RealtyWyze org (vertical=real_estate) with 403 error', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/monroney-extract/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/monroney-extract',
        {
          method: 'POST',
          body: JSON.stringify({
            imageBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            imageMimeType: 'image/png',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('not available for your organization type'),
        })
      )

      // Verify audit log
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_monroney_extract',
          orgId: reOrgId,
          actorId: userId,
          actorType: 'user',
          entityType: 'vehicle',
          metadata: expect.objectContaining({
            org_vertical: 'real_estate',
            reason: 'Monroney extract restricted to dealer vertical',
          }),
        })
      )
    })

    it('allows dealer org (vertical=dealer) to proceed', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/monroney-extract/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('dealer'))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/monroney-extract',
        {
          method: 'POST',
          body: JSON.stringify({
            imageBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            imageMimeType: 'image/png',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)

      // Should not fail due to vertical mismatch (may fail for other reasons like invalid image)
      expect(response.status).not.toBe(403)

      // Audit log should NOT be called for vertical violations on allowed orgs
      expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_monroney_extract',
        })
      )
    })

    it('returns 404 when organization not found', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/monroney-extract/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient(null, true))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/monroney-extract',
        {
          method: 'POST',
          body: JSON.stringify({
            imageBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            imageMimeType: 'image/png',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toContain('Organization not found')
    })

    it('respects rate limit before vertical check', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/monroney-extract/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockOrgBulkExtractLimiter.mockResolvedValueOnce({ allowed: false })

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/monroney-extract',
        {
          method: 'POST',
          body: JSON.stringify({
            imageBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            imageMimeType: 'image/png',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(429)
      expect(mockCreateClient).not.toHaveBeenCalled()
    })
  })

  describe('Bulk Import Endpoint (/api/vehicles/intake/bulk-import)', () => {
    it('rejects RealtyWyze org (vertical=real_estate) with 403 error', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/bulk-import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [],
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('not available for your organization type'),
        })
      )

      // Verify audit log
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_bulk_import',
          orgId: reOrgId,
          actorId: userId,
          actorType: 'user',
          entityType: 'vehicle',
          metadata: expect.objectContaining({
            org_vertical: 'real_estate',
            reason: 'Bulk vehicle import restricted to dealer vertical',
          }),
        })
      )
    })

    it('allows dealer org (vertical=dealer) to proceed', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/bulk-import/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('dealer'))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [],
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)

      // Should not fail due to vertical mismatch (may fail for empty items)
      expect(response.status).not.toBe(403)

      // Audit log should NOT be called for vertical violations on allowed orgs
      expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vertical_violation_bulk_import',
        })
      )
    })

    it('returns 404 when organization not found', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/bulk-import/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient(null, true))

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [],
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toContain('Organization not found')
    })

    it('respects rate limit before vertical check', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/bulk-import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockOrgBulkExtractLimiter.mockResolvedValueOnce({ allowed: false })

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [],
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(req)
      expect(response.status).toBe(429)
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('uses bulk extract limiter for rate limiting', async () => {
      const { POST } = await import('@/app/api/vehicles/intake/bulk-import/route')

      mockRequireProfile.mockResolvedValueOnce(dealerProfile)
      mockOrgBulkExtractLimiter.mockResolvedValueOnce({ allowed: true })

      const req = new NextRequest(
        'http://localhost/api/vehicles/intake/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [],
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      await POST(req)

      // Should have called the bulk extract limiter, not the CSV limiter
      expect(mockOrgBulkExtractLimiter).toHaveBeenCalledWith(dealerOrgId)
      expect(mockOrgCsvImportLimiter).not.toHaveBeenCalled()
    })
  })

  describe('Vertical Enforcement Order', () => {
    it('performs vertical check AFTER rate limit check', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockOrgCsvImportLimiter.mockResolvedValueOnce({ allowed: false })

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
      })

      const response = await POST(req)

      // Should fail on rate limit (429), not vertical check (403)
      expect(response.status).toBe(429)

      // Should NOT have queried organizations table
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('performs vertical check BEFORE file/body processing', async () => {
      const { POST } = await import('@/app/api/vehicles/import/route')

      mockRequireProfile.mockResolvedValueOnce(reProfile)
      mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))

      const req = new NextRequest('http://localhost/api/vehicles/import', {
        method: 'POST',
        // No file in form data
      })

      const response = await POST(req)

      // Should fail on vertical check (403), not file validation
      expect(response.status).toBe(403)
    })
  })

  describe('Audit Log Details', () => {
    it('logs correct action names for each endpoint', async () => {
      // CSV import
      {
        const { POST: csvPOST } = await import('@/app/api/vehicles/import/route')
        mockRequireProfile.mockResolvedValueOnce(reProfile)
        mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))
        await csvPOST(new NextRequest('http://localhost/api/vehicles/import', { method: 'POST' }))
        expect(mockWriteAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'vertical_violation_csv_import' })
        )
      }

      vi.clearAllMocks()

      // Monroney extract
      {
        const { POST: monreyPOST } = await import(
          '@/app/api/vehicles/intake/monroney-extract/route'
        )
        mockRequireProfile.mockResolvedValueOnce(reProfile)
        mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))
        const req = new NextRequest(
          'http://localhost/api/vehicles/intake/monroney-extract',
          {
            method: 'POST',
            body: JSON.stringify({ imageBase64: 'test' }),
            headers: { 'Content-Type': 'application/json' },
          }
        )
        await monreyPOST(req)
        expect(mockWriteAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'vertical_violation_monroney_extract' })
        )
      }

      vi.clearAllMocks()

      // Bulk import
      {
        const { POST: bulkPOST } = await import(
          '@/app/api/vehicles/intake/bulk-import/route'
        )
        mockRequireProfile.mockResolvedValueOnce(reProfile)
        mockCreateClient.mockResolvedValueOnce(createMockSupabaseClient('real_estate'))
        const req = new NextRequest(
          'http://localhost/api/vehicles/intake/bulk-import',
          {
            method: 'POST',
            body: JSON.stringify({ items: [] }),
            headers: { 'Content-Type': 'application/json' },
          }
        )
        await bulkPOST(req)
        expect(mockWriteAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'vertical_violation_bulk_import' })
        )
      }
    })
  })
})
