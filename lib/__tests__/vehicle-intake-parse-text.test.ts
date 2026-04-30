import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const { mockRequireProfile, mockAssertCanUseFeature, mockExtractVehicleFromPastedText } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
  mockAssertCanUseFeature: vi.fn(),
  mockExtractVehicleFromPastedText: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/billing/assertFeature', async () => {
  class BillingError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'BillingError'
    }
  }
  return {
    BillingError,
    assertCanUseFeature: mockAssertCanUseFeature,
  }
})

vi.mock('@/lib/vehicles/pasteExtract', () => ({
  extractVehicleFromPastedText: mockExtractVehicleFromPastedText,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://dealerwyze.com/api/vehicles/intake/parse-text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireProfile.mockResolvedValue({ org_id: 'org-1', id: 'user-1', role: 'dealer_admin' })
  mockAssertCanUseFeature.mockResolvedValue(undefined)
})

describe('POST /api/vehicles/intake/parse-text', () => {
  it('returns 400 on too-short pasted text', async () => {
    const { POST } = await import('@/app/api/vehicles/intake/parse-text/route')
    const res = await POST(makeReq({ text: 'too short' }))
    expect(res.status).toBe(400)
  })

  it('returns extracted vehicle acquisition fields on success', async () => {
    mockExtractVehicleFromPastedText.mockResolvedValue({
      vin: '2C4RDGEG8KR750359',
      year: 2019,
      make: 'Dodge',
      model: 'Grand Caravan',
      trim: 'GT',
      mileage: 103028,
      color: 'Silver',
      purchase_price: 7000,
      purchased_at: '2026-04-26',
      purchased_from: 'ACV Auctions',
      acquisition_source: 'auction',
      auction_name: 'ACV Auctions',
      auction_lot: '15287526',
      status: 'staging',
      notes: 'Auction ID 15287526; title absent; cracked windshield',
    })

    const { POST } = await import('@/app/api/vehicles/intake/parse-text/route')
    const res = await POST(makeReq({ text: 'A long enough pasted auction page goes here with lots of vehicle text.' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.vin).toBe('2C4RDGEG8KR750359')
    expect(json.purchase_price).toBe(7000)
    expect(json.purchased_at).toBe('2026-04-26')
    expect(json.auction_name).toBe('ACV Auctions')
    expect(json.auction_lot).toBe('15287526')
    expect(json.status).toBe('staging')
  })

  it('returns 422 when AI cannot identify a vehicle', async () => {
    mockExtractVehicleFromPastedText.mockResolvedValue({
      vin: null,
      year: null,
      make: null,
      model: null,
      trim: null,
      mileage: null,
      color: null,
      purchase_price: null,
      purchased_at: null,
      purchased_from: null,
      acquisition_source: null,
      auction_name: null,
      auction_lot: null,
      status: null,
      notes: null,
    })

    const { POST } = await import('@/app/api/vehicles/intake/parse-text/route')
    const res = await POST(makeReq({ text: 'This is still long enough text but contains no usable vehicle details at all.' }))
    expect(res.status).toBe(422)
  })
})
