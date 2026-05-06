import type { MetadataRoute } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { getPublicAppBaseUrl } from '@/lib/dealer-public/site'

/** Dealer inventory changes often; always read from DB (not build-time snapshot). */
export const dynamic = 'force-dynamic'

type VehicleRow = {
  id: string
  public_slug: string | null
  user_id: string
  created_at: string | null
}

/** Flat URL list for all public dealer inventory + VDPs (excludes noindex orgs). Single vehicles query. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicAppBaseUrl().replace(/\/$/, '')
  const supabase = createServiceClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, slug, updated_at')
    .eq('public_inventory_enabled', true)
    .or('website_robots_noindex.is.null,website_robots_noindex.eq.false')

  const orgList = (orgs ?? []).filter(o => (o.slug as string)?.trim()) as {
    id: string
    slug: string
    updated_at: string | null
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

  for (const org of orgList) {
    const slug = slugByOrgId.get(org.id)!
    const invUrl = `${base}/${slug}/inventory`
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
      url: invUrl,
      lastModified: invLastMod,
      changeFrequency: 'daily',
      priority: 0.9,
    })

    for (const v of vlist) {
      const seg = v.public_slug?.trim() || v.id
      out.push({
        url: `${base}/${slug}/inventory/${encodeURIComponent(seg)}`,
        lastModified: v.created_at ? new Date(v.created_at) : invLastMod,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  return out
}
