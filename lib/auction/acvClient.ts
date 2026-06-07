import type { AuctionVehicle } from './auctionTypes'

interface ACVVehicleResponse {
  id: string
  vin?: string
  year?: number
  make?: string
  model?: string
  trim?: string
  lot_number?: string
  current_bid?: number
  location?: string
  sale_date?: string
  [key: string]: unknown
}

export class ACVClient {
  private apiKey: string
  private baseUrl = 'https://api.auctions.acvauctiontech.com/v1'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ACV_API_KEY || ''

    if (!this.apiKey) {
      throw new Error('ACV_API_KEY required')
    }
  }

  /**
   * Search for vehicles by criteria.
   * Returns array of AuctionVehicle objects.
   */
  async search(criteria: {
    make?: string
    model?: string
    year_min?: number
    year_max?: number
    limit?: number
  }): Promise<AuctionVehicle[]> {
    try {
      const query = new URLSearchParams()
      if (criteria.make) query.set('make', criteria.make)
      if (criteria.model) query.set('model', criteria.model)
      if (criteria.year_min) query.set('year_min', String(criteria.year_min))
      if (criteria.year_max) query.set('year_max', String(criteria.year_max))
      query.set('status', 'active')
      query.set('limit', String(criteria.limit || 100))

      const url = `${this.baseUrl}/inventory?${query.toString()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 },
      })

      if (!res.ok) {
        throw new Error(`ACV API error: ${res.status}`)
      }

      const data = await res.json()
      const vehicles = Array.isArray(data?.data) ? data.data : []

      return vehicles.map((item: ACVVehicleResponse) => ({
        source: 'acv' as const,
        external_id: item.id,
        vin: item.vin || null,
        year: item.year || null,
        make: item.make || null,
        model: item.model || null,
        trim: item.trim || null,
        lot_number: item.lot_number || null,
        current_bid: item.current_bid || null,
        estimated_repair_cost: null, // ACV doesn't return repair cost
        primary_damage: null,
        secondary_damage: null,
        sale_date: item.sale_date || null,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[ACVClient.search]', message)
      return []
    }
  }

  /**
   * Get details for a specific vehicle by ID.
   */
  async getVehicle(id: string): Promise<AuctionVehicle | null> {
    try {
      const url = `${this.baseUrl}/vehicles/${id}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      })

      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`ACV API error: ${res.status}`)
      }

      const item = await res.json()

      return {
        source: 'acv',
        external_id: item.id,
        vin: item.vin || null,
        year: item.year || null,
        make: item.make || null,
        model: item.model || null,
        trim: item.trim || null,
        lot_number: item.lot_number || null,
        current_bid: item.current_bid || null,
        estimated_repair_cost: null,
        primary_damage: null,
        secondary_damage: null,
        sale_date: item.sale_date || null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[ACVClient.getVehicle]', message)
      return null
    }
  }
}
