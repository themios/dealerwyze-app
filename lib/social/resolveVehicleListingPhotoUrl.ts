import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalize for comparison — strips fragments; collapses trivial path differences */
function canonMediaUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    u.pathname = u.pathname.replace(/\/+$/, '') || '/'
    return u.toString()
  } catch {
    return raw.trim()
  }
}

/**
 * Validates user-supplied `photoUrl` is exactly one of this vehicle's stored gallery URLs.
 * SSRF safeguard before Meta pulls the asset.
 */
export async function assertListingPhotoBelongsToVehicle(
  svc: SupabaseClient,
  vehicleId: string,
  candidateRaw: string,
): Promise<{ okUrl: string }> {
  const candRawFull = candidateRaw.trim()
  const candidateCanon = canonMediaUrl(candidateRaw)

  const { data: rows } = await svc
    .from('vehicle_photos')
    .select('url')
    .eq('vehicle_id', vehicleId)

  const { data: vehicleRow } = await svc
    .from('vehicles')
    .select('photo_url')
    .eq('id', vehicleId)
    .maybeSingle()

  const allowRaw = new Set<string>()
  for (const row of rows ?? []) {
    const u = typeof row.url === 'string' ? row.url.trim() : ''
    if (u.startsWith('http')) {
      allowRaw.add(u)
    }
  }
  const vu = vehicleRow?.photo_url
  if (typeof vu === 'string' && vu.trim().startsWith('http')) {
    allowRaw.add(vu.trim())
  }

  const directHit = [...allowRaw].find(r => r === candRawFull)
  if (directHit) return { okUrl: directHit }

  const canonHit = [...allowRaw].find(r => canonMediaUrl(r) === candidateCanon)
  if (canonHit) return { okUrl: canonHit }
  throw new Error('photoUrl must match a listing photo owned by this vehicle')
}
