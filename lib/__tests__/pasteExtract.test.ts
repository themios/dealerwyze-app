import { describe, expect, it } from 'vitest'
import { extractVehicleFromPastedTextHeuristically } from '@/lib/vehicles/pasteExtract'

const ACV_SAMPLE = `
Marketplace
My ACV
Auction ID#15287526
Auction Date04/26/2026
Purchase
$7,000
Auction
Won
2019 Dodge Grand Caravan
GT 29N • FWD • 6cyl
2C4RDGEG8KR750359
103,028 Miles
Cracked Windshield
Broken Tail Lamp
Vehicle comes with 1 key.
Title Absent (30 Days)
Vehicle Details
VIN
2C4RDGEG8KR750359
Odometer 103,028
Trim GT
Color Silver
`

const OPENLANE_SAMPLE = `
Marketplace
Auction
My purchases
OPENLANE Predictive Pricing
2013 Mazda Mazda3 i
145,522 miles
VIN
JM1BL1TG6D1768399
Published on Apr 23 at 10:45 am
5
Owner(s)
1
Accident(s)
Walden Auto LLC
Tucson, AZ
Air conditioning operation
Caution
Inoperable
Won
$1,550
2 Bids
Current
$3,075
Low
$2,463
High
$3,687
Checkout
`

describe('extractVehicleFromPastedTextHeuristically', () => {
  it('extracts ACV auction vehicle fields deterministically', () => {
    const extracted = extractVehicleFromPastedTextHeuristically(ACV_SAMPLE)

    expect(extracted.vin).toBe('2C4RDGEG8KR750359')
    expect(extracted.year).toBe(2019)
    expect(extracted.make).toBe('Dodge')
    expect(extracted.model).toBe('Grand Caravan')
    expect(extracted.trim).toBe('GT')
    expect(extracted.mileage).toBe(103028)
    expect(extracted.color).toBe('Silver')
    expect(extracted.purchase_price).toBe(7000)
    expect(extracted.purchased_at).toBe('2026-04-26')
    expect(extracted.acquisition_source).toBe('auction')
    expect(extracted.auction_name).toBe('ACV Auctions')
    expect(extracted.auction_lot).toBe('15287526')
    expect(extracted.status).toBe('staging')
    expect(extracted.notes).toContain('Title Absent')
    expect(extracted.notes).toContain('Cracked Windshield')
  })

  it('extracts OPENLANE won price without using predictive pricing ranges', () => {
    const extracted = extractVehicleFromPastedTextHeuristically(OPENLANE_SAMPLE)

    expect(extracted.vin).toBe('JM1BL1TG6D1768399')
    expect(extracted.year).toBe(2013)
    expect(extracted.make).toBe('Mazda')
    expect(extracted.model).toBe('Mazda3')
    expect(extracted.trim).toBe('i')
    expect(extracted.mileage).toBe(145522)
    expect(extracted.purchase_price).toBe(1550)
    expect(extracted.purchase_price).not.toBe(3075)
    expect(extracted.auction_name).toBe('OPENLANE')
    expect(extracted.acquisition_source).toBe('auction')
    expect(extracted.status).toBe('staging')
    expect(extracted.notes).toContain('5 owner(s)')
    expect(extracted.notes).toContain('1 accident(s)')
    expect(extracted.notes).toContain('Air conditioning inoperable')
  })
})
