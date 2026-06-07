import type { AuctionVehicle } from './auctionTypes'

interface CopartListingResponse {
  vehicleBin: number
  sale_date?: string
  year?: number
  make?: string
  model?: string
  trim?: string
  vin?: string
  lots?: Array<{
    lot_number: string
    current_bid?: number
    est_repair_cost?: number
  }>
  primary_damage?: string
  secondary_damage?: string
}

export class CopartClient {
  private apiKey: string
  private username: string
  private baseUrl = 'https://api.copart.com/api'

  constructor(apiKey?: string, username?: string) {
    this.apiKey = apiKey || process.env.COPART_API_KEY || ''
    this.username = username || process.env.COPART_USERNAME || ''

    if (!this.apiKey || !this.username) {
      throw new Error('COPART_API_KEY and COPART_USERNAME required')
    }
  }

  /**
   * Search for vehicles by criteria (make, model, year range).
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
      if (criteria.year_min) query.set('year_from', String(criteria.year_min))
      if (criteria.year_max) query.set('year_to', String(criteria.year_max))
      query.set('status', 'Active')
      query.set('limit', String(criteria.limit || 100))

      const url = `${this.baseUrl}/inventory?${query.toString()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Username': this.username,
        },
        next: { revalidate: 3600 }, // cache 1 hour (auction data changes slowly)
      })

      if (!res.ok) {
        throw new Error(`Copart API error: ${res.status}`)
      }

      const data = await res.json()
      const listings = Array.isArray(data?.data) ? data.data : []

      return listings.map((item: CopartListingResponse) => ({
        source: 'copart' as const,
        external_id: String(item.vehicleBin),
        vin: item.vin || null,
        year: item.year || null,
        make: item.make || null,
        model: item.model || null,
        trim: item.trim || null,
        lot_number: item.lots?.[0]?.lot_number || null,
        current_bid: item.lots?.[0]?.current_bid || null,
        estimated_repair_cost: item.lots?.[0]?.est_repair_cost || null,
        primary_damage: item.primary_damage || null,
        secondary_damage: item.secondary_damage || null,
        sale_date: item.sale_date || null,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[CopartClient.search]', message)
      return []
    }
  }

  /**
   * Get details for a specific vehicle by bin number.
   */
  async getVehicle(bin: string): Promise<AuctionVehicle | null> {
    try {
      const url = `${this.baseUrl}/vehicle/${bin}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Username': this.username,
        },
      })

      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`Copart API error: ${res.status}`)
      }

      const item = await res.json()

      return {
        source: 'copart',
        external_id: String(item.vehicleBin),
        vin: item.vin || null,
        year: item.year || null,
        make: item.make || null,
        model: item.model || null,
        trim: item.trim || null,
        lot_number: item.lots?.[0]?.lot_number || null,
        current_bid: item.lots?.[0]?.current_bid || null,
        estimated_repair_cost: item.lots?.[0]?.est_repair_cost || null,
        primary_damage: item.primary_damage || null,
        secondary_damage: item.secondary_damage || null,
        sale_date: item.sale_date || null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[CopartClient.getVehicle]', message)
      return null
    }
  }
}
