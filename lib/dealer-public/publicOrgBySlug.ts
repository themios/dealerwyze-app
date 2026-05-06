import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Load organizations whose `slug` matches the URL segment (case-insensitive).
 * Do not use `.maybeSingle()` here: multiple rows (e.g. `apollo-auto` vs `Apollo-Auto`) make PostgREST error and surface as 404.
 */
export async function loadOrganizationsMatchingPublicSlug(
  supabase: SupabaseClient,
  slugNorm: string,
  select: string,
  options?: { onlyPublicInventory?: boolean },
): Promise<{
  rows: unknown[]
  error: { message: string; code?: string } | null
}> {
  let q = supabase.from('organizations').select(select).ilike('slug', slugNorm)
  if (options?.onlyPublicInventory) {
    q = q.eq('public_inventory_enabled', true)
  }
  const { data, error } = await q
  if (error) {
    return { rows: [], error: { message: error.message, code: error.code } }
  }
  return { rows: data ?? [], error: null }
}

/**
 * Pick a single row when `ilike` may match multiple case variants.
 * Prefer exact `slug === slugFromPath` when the URL casing is unambiguous.
 */
export function pickUniqueOrgSlugMatch<T extends { slug: string }>(
  rows: T[],
  slugFromPath: string,
): { row: T | null; ambiguous: boolean } {
  if (rows.length === 0) return { row: null, ambiguous: false }
  if (rows.length === 1) return { row: rows[0], ambiguous: false }

  const exact = rows.filter(r => r.slug === slugFromPath)
  if (exact.length === 1) return { row: exact[0], ambiguous: false }

  return { row: null, ambiguous: true }
}
