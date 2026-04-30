import 'server-only'

/**
 * MarketCheck API — active used-car listing comps.
 * Free tier: 50 results/query, clean-title only, mileage-banded.
 * API: https://apidocs.marketcheck.com/  endpoint: GET /v2/search/car/active
 */

export interface MarketCheckStats {
  totalActive: number
  medianPrice: number
  meanPrice: number
  p10Price: number
  p25Price: number
  p90Price: number
  medianMiles: number
  avgDom: number       // average days on market
  sampleSize: number
}

interface MarketCheckListing {
  price?: number | string | null
  miles?: number | string | null
  dom?: number | string | null
}

interface MarketCheckResponse {
  num_found?: number
  listings?: MarketCheckListing[]
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 0
    ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : sorted[Math.floor(n / 2)]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

export async function fetchMarketCheckStats(
  year: number,
  make: string,
  model: string,
  trim?: string | null,
  targetMileage?: number | null,
): Promise<MarketCheckStats | null> {
  const apiKey = process.env.MARKETCHECK_API_KEY
  if (!apiKey) {
    console.warn('[MarketCheck] MARKETCHECK_API_KEY not set')
    return null
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      year: String(year),
      make: make.toLowerCase(),
      model: model.toLowerCase(),
      car_type: 'used',
      rows: '50',
      fields: 'price,miles,dom,city,state,build.trim,vehicle_status',
      title_status: 'clean',
      has_price: 'true',
      has_miles: 'true',
    })

    if (trim) params.set('trim', trim)

    // Mileage band: ±40% (±50% for very high mileage vehicles)
    if (targetMileage && targetMileage > 0) {
      const band = targetMileage > 180_000 ? 0.50 : 0.40
      params.set('miles_range', `${Math.max(0, Math.round(targetMileage * (1 - band)))}:${Math.round(targetMileage * (1 + band))}`)
    }

    const res = await fetch(
      `https://mc-api.marketcheck.com/v2/search/car/active?${params}`,
      { signal: AbortSignal.timeout(12_000), headers: { 'x-version': 'v4.6.0' } },
    )

    if (!res.ok) {
      console.warn(`[MarketCheck] ${res.status} ${res.statusText}`)
      return null
    }

    const data = await res.json() as MarketCheckResponse
    const totalActive: number = data.num_found ?? 0
    const listings = data.listings ?? []

    const bandLow  = targetMileage && targetMileage > 0 ? targetMileage * (targetMileage > 180_000 ? 0.50 : 0.60) : 0
    const bandHigh = targetMileage && targetMileage > 0 ? targetMileage * (targetMileage > 180_000 ? 1.50 : 1.40) : Infinity

    const valid = listings
      .map(l => ({
        price: Number(l.price),
        miles: Number(l.miles),
        dom:   Number(l.dom) || 0,
      }))
      .filter(l => {
        if (l.price < 1_000 || l.price > 300_000) return false
        if (l.miles < 0) return false
        if (targetMileage && targetMileage > 0 && l.miles > 0) {
          if (l.miles < bandLow || l.miles > bandHigh) return false
        }
        return true
      })

    if (valid.length === 0) {
      console.warn(`[MarketCheck] No valid listings for ${year} ${make} ${model}`)
      return null
    }

    const prices = valid.map(l => l.price).sort((a, b) => a - b)
    const miles  = valid.map(l => l.miles).filter(m => m > 0).sort((a, b) => a - b)
    const doms   = valid.map(l => l.dom).filter(d => d > 0)

    const stats: MarketCheckStats = {
      totalActive,
      medianPrice: median(prices),
      meanPrice:   Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      p10Price:    percentile(prices, 0.1),
      p25Price:    percentile(prices, 0.25),
      p90Price:    percentile(prices, 0.9),
      medianMiles: median(miles),
      avgDom:      doms.length > 0 ? Math.round(doms.reduce((s, d) => s + d, 0) / doms.length) : 0,
      sampleSize:  valid.length,
    }

    console.log(
      `[MarketCheck] ${year} ${make} ${model} — ${totalActive} active, ` +
      `${valid.length} clean comps, median $${stats.medianPrice.toLocaleString()}, ` +
      `P25 $${stats.p25Price.toLocaleString()}, DOM ${stats.avgDom}d`
    )

    return stats
  } catch (err) {
    console.warn('[MarketCheck] fetch error (non-fatal):', err)
    return null
  }
}
