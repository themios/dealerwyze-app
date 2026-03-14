import 'server-only'

/**
 * NHTSA Vehicle Safety API — free, no key required.
 * Fetches active recall count for a given year/make/model.
 * API: https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=
 */

export interface NhtsaResult {
  recallCount: number
  /** 'low' = 0-1, 'moderate' = 2-4, 'high' = 5+ recalls */
  tier: 'low' | 'moderate' | 'high'
  /** Most recent recall description (for display) */
  latestRecall: string | null
}

export async function fetchNhtsaRecalls(
  year: number,
  make: string,
  model: string,
): Promise<NhtsaResult> {
  const fallback: NhtsaResult = { recallCount: 0, tier: 'low', latestRecall: null }

  try {
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 }, // cache 24h at edge — recall data changes rarely
    })

    if (!res.ok) {
      console.warn(`[NHTSA] ${res.status} for ${year} ${make} ${model}`)
      return fallback
    }

    const data = await res.json()
    const results: any[] = data.results ?? []
    const count = results.length

    const tier: 'low' | 'moderate' | 'high' =
      count === 0 ? 'low' :
      count <= 4  ? 'moderate' : 'high'

    const latest = results[0]
      ? `${results[0].Component ?? ''}: ${(results[0].Summary ?? '').slice(0, 160)}`
      : null

    console.log(`[NHTSA] ${year} ${make} ${model} — ${count} recalls (${tier})`)

    return { recallCount: count, tier, latestRecall: latest }
  } catch (err) {
    console.warn('[NHTSA] fetch error (non-fatal):', err)
    return fallback
  }
}
