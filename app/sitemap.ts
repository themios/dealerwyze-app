import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { getBaseUrlForHost } from '@/lib/dealer-public/site'
import { resolveVertical } from '@/proxy'

/** Inventory changes often; always read from DB (not build-time snapshot). */
export const dynamic = 'force-dynamic'

type VehicleRow = {
  id: string
  public_slug: string | null
  user_id: string
  created_at: string | null
}

/** URL list for public inventory/listings scoped to the current domain's vertical. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') ?? ''
  const base = getBaseUrlForHost(host).replace(/\/$/, '')
  const vertical = resolveVertical(host)
  const supabase = createServiceClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, slug, updated_at, vertical')
    .eq('public_inventory_enabled', true)
    .or('website_robots_noindex.is.null,website_robots_noindex.eq.false')

  // Only include orgs that belong to this domain's vertical.
  // dealer vertical = orgs where vertical is 'dealer' or null (legacy rows pre-dating the column).
  // real_estate vertical = orgs where vertical is 'real_estate'.
  const orgList = (orgs ?? [])
    .filter(o => (o.slug as string)?.trim())
    .filter(o => {
      const v = (o as Record<string, unknown>).vertical as string | null
      return vertical === 'real_estate' ? v === 'real_estate' : (v === 'dealer' || v == null)
    }) as {
    id: string
    slug: string
    updated_at: string | null
    vertical: string | null
  }[]

  if (!orgList.length) return []

  const orgIds = orgList.map(o => o.id)
  const slugByOrgId = new Map(orgList.map(o => [o.id, o.slug.trim()]))

  const { data: vehicleRows } = await supabase
    .from('vehicles')
    .select('id, public_slug, user_id, created_at')
    .in('user_id', orgIds)
    .eq('published', true)
    .neq('status', 'sold')

  const vehiclesByOrg = new Map<string, VehicleRow[]>()
  for (const row of (vehicleRows ?? []) as VehicleRow[]) {
    const uid = row.user_id
    if (!vehiclesByOrg.has(uid)) vehiclesByOrg.set(uid, [])
    vehiclesByOrg.get(uid)!.push(row)
  }

  const out: MetadataRoute.Sitemap = []

  // Add legal pages at the start
  out.push({
    url: `${base}/terms`,
    changeFrequency: 'monthly',
    priority: 0.5,
  })
  out.push({
    url: `${base}/privacy`,
    changeFrequency: 'monthly',
    priority: 0.5,
  })

  for (const org of orgList) {
    const slug = slugByOrgId.get(org.id)!
    const isRE = org.vertical === 'real_estate'
    const catalogSegment = isRE ? 'listings' : 'inventory'
    const catalogUrl = `${base}/${slug}/${catalogSegment}`
    const vlist = vehiclesByOrg.get(org.id) ?? []

    let invLastMod: Date | undefined
    for (const v of vlist) {
      if (v.created_at) {
        const d = new Date(v.created_at)
        if (!invLastMod || d > invLastMod) invLastMod = d
      }
    }
    if (!invLastMod && org.updated_at) {
      invLastMod = new Date(org.updated_at)
    }

    out.push({
      url: catalogUrl,
      lastModified: invLastMod,
      changeFrequency: 'daily',
      priority: 0.9,
    })

    for (const v of vlist) {
      const seg = isRE ? v.id : (v.public_slug?.trim() || v.id)
      out.push({
        url: `${base}/${slug}/${catalogSegment}/${encodeURIComponent(seg)}`,
        lastModified: v.created_at ? new Date(v.created_at) : invLastMod,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  return out
}
