import { describe, expect, it } from 'vitest'
import { computeVehicleIntakeMerge } from '@/lib/vehicles/intakeMerge'

describe('computeVehicleIntakeMerge', () => {
  it('fills empty fields and preserves existing data', () => {
    const result = computeVehicleIntakeMerge(
      {
        stock_no: null,
        vin: null,
        year: 2019,
        make: 'Dodge',
        model: 'Grand Caravan',
        trim: null,
        mileage: null,
        color: null,
        purchase_price: null,
        purchased_from: null,
        purchased_at: null,
        acquisition_source: null,
        auction_name: null,
        auction_lot: null,
        acquisition_notes: null,
      },
      {
        vin: '2C4RDGEG8KR750359',
        year: 2019,
        make: 'Dodge',
        model: 'Grand Caravan',
        trim: 'GT',
        mileage: 103028,
        color: 'Silver',
        purchase_price: 7000,
        purchased_from: 'ACV Auctions',
        purchased_at: '2026-04-26',
        acquisition_source: 'auction',
        auction_name: 'ACV Auctions',
        auction_lot: '15287526',
        acquisition_notes: 'Title absent. Cracked windshield.',
      },
    )

    expect(result.patch).toMatchObject({
      stock_no: '750359',
      vin: '2C4RDGEG8KR750359',
      trim: 'GT',
      mileage: 103028,
      color: 'Silver',
      purchase_price: 7000,
      purchased_from: 'ACV Auctions',
      purchased_at: '2026-04-26',
      acquisition_source: 'auction',
      auction_name: 'ACV Auctions',
      auction_lot: '15287526',
      acquisition_notes: 'Title absent. Cracked windshield.',
    })
    expect(result.ignored).toHaveLength(0)
  })

  it('appends new acquisition notes instead of overwriting them', () => {
    const result = computeVehicleIntakeMerge(
      {
        stock_no: '750359',
        vin: '2C4RDGEG8KR750359',
        year: 2019,
        make: 'Dodge',
        model: 'Grand Caravan',
        trim: 'GT',
        mileage: 103028,
        color: 'Silver',
        purchase_price: 7000,
        purchased_from: 'ACV Auctions',
        purchased_at: '2026-04-26',
        acquisition_source: 'auction',
        auction_name: 'ACV Auctions',
        auction_lot: '15287526',
        acquisition_notes: 'Existing notes.',
      },
      {
        acquisition_notes: 'Fresh intake details.',
      },
    )

    expect(result.patch.acquisition_notes).toBe('Existing notes.\n\nImported intake notes:\nFresh intake details.')
    expect(result.additions).toEqual([
      expect.objectContaining({
        field: 'acquisition_notes',
        mode: 'append',
      }),
    ])
  })

  it('reports conflicting fields as ignored', () => {
    const result = computeVehicleIntakeMerge(
      {
        stock_no: '750359',
        vin: '2C4RDGEG8KR750359',
        year: 2019,
        make: 'Dodge',
        model: 'Grand Caravan',
        trim: 'GT',
        mileage: 103028,
        color: 'Silver',
        purchase_price: 7000,
        purchased_from: 'ACV Auctions',
        purchased_at: '2026-04-26',
        acquisition_source: 'auction',
        auction_name: 'ACV Auctions',
        auction_lot: '15287526',
        acquisition_notes: 'Existing notes.',
      },
      {
        vin: '2C4RDGEG8KR750359',
        color: 'Blue',
        purchase_price: 7100,
        purchased_from: 'OPENLANE',
      },
    )

    expect(result.patch).toEqual({})
    expect(result.ignored).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'color', incoming: 'Blue' }),
      expect.objectContaining({ field: 'purchase_price', incoming: '7100' }),
      expect.objectContaining({ field: 'purchased_from', incoming: 'OPENLANE' }),
    ]))
  })
})
