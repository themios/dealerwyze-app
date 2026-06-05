import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { isReservedPublicSlug } from '@/lib/dealer-public/reservedSlugs'
import { loadOrganizationsMatchingPublicSlug, pickUniqueOrgSlugMatch } from '@/lib/dealer-public/publicOrgBySlug'

interface Props {
  params: Promise<{ slug: string }>
}

function normalizeSlugParam(s: string) {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

/** Public org landing: dealers → inventory, real estate → listings. */
export default async function DealerPublicIndexPage({ params }: Props) {
  const { slug } = await params
  const normalized = normalizeSlugParam(slug)
  if (isReservedPublicSlug(normalized)) notFound()

  const supabase = createServiceClient()
  const { rows } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    normalized,
    'id, slug, vertical, public_inventory_enabled',
    { onlyPublicInventory: false },
  )
  const { row: org } = pickUniqueOrgSlugMatch(
    rows as Array<{ slug: string; vertical: string | null; public_inventory_enabled: boolean | null }>,
    normalized,
  )
  if (!org || org.public_inventory_enabled !== true) notFound()

  if (org.vertical === 'real_estate') {
    redirect(`/${normalized}/listings`)
  }
  redirect(`/${normalized}/inventory`)
}
