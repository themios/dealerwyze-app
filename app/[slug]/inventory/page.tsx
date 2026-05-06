import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import InventoryFilters from './InventoryFilters'
import {
  absoluteUrl,
  DEALER_THEME_DEFAULT_LOGO_PATH,
  getPublicAppBaseUrl,
  jsonLdInline,
} from '@/lib/dealer-public/site'
import {
  buildPublicMetaDescription,
  metaKeywordsList,
} from '@/lib/dealer-public/personalization'
import {
  loadOrganizationsMatchingPublicSlug,
  pickUniqueOrgSlugMatch,
} from '@/lib/dealer-public/publicOrgBySlug'

const INVENTORY_ORG_META_SELECT = `id, name, website_tagline, slug, website_about, website_seo_description, website_seo_keywords,
      website_robots_noindex, website_og_image_url, website_logo_url`

const INVENTORY_ORG_PAGE_SELECT = `id, name, slug, website_about, website_tagline, website_hero_headline, website_hero_subline,
      website_specialty_tags, website_service_area`

interface InventoryOrgMetaRow {
  slug: string
  id: string
  name: string
  website_tagline: string | null
  website_about: string | null
  website_seo_description: string | null
  website_seo_keywords: string | null
  website_robots_noindex: boolean | null
  website_og_image_url: string | null
  website_logo_url: string | null
}

interface InventoryOrgPageRow {
  slug: string
  id: string
  name: string
  website_about: string | null
  website_tagline: string | null
  website_hero_headline: string | null
  website_hero_subline: string | null
  website_specialty_tags: unknown
  website_service_area: string | null
}
import DealerPublicAboutSection from '@/components/dealer-public/DealerPublicAboutSection'

export const dynamic = 'force-dynamic'

function normalizeSlugParam(s: string) {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ make?: string; model?: string; min?: string; max?: string; q?: string }>
}

function formatPrice(price: number | null): string {
  if (!price) return 'Call for price'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
}

function formatMileage(miles: number | null): string {
  if (!miles) return ''
  return new Intl.NumberFormat('en-US').format(miles) + ' mi'
}

function inventoryRobots(noindex: boolean | null | undefined): Metadata['robots'] {
  if (noindex) return { index: false, follow: false }
  return { index: true, follow: true }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error: metaErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    INVENTORY_ORG_META_SELECT,
    { onlyPublicInventory: true },
  )
  if (metaErr) return {}
  const { row: org, ambiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as InventoryOrgMetaRow[],
    slugNorm,
  )
  if (!org || ambiguous) return {}

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', org.id)
    .maybeSingle()

  const displayName = settings?.business_name?.trim() || org.name
  const title = `Used vehicle inventory — ${displayName}`
  const description = buildPublicMetaDescription({
    seoDescription: org.website_seo_description,
    tagline: org.website_tagline,
    about: org.website_about,
    displayName,
  })
  const keywords = metaKeywordsList(org.website_seo_keywords ?? undefined)

  const canonical = absoluteUrl(`/${org.slug}/inventory`)
  const logoAbs = org.website_logo_url?.trim()
    ? org.website_logo_url.trim()
    : absoluteUrl(DEALER_THEME_DEFAULT_LOGO_PATH)
  const ogImage = org.website_og_image_url?.trim() || logoAbs
  const ogDims = org.website_og_image_url?.trim()
    ? { width: 1200, height: 630 }
    : { width: 512, height: 512 }

  return {
    metadataBase: new URL(getPublicAppBaseUrl()),
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical },
    robots: inventoryRobots(org.website_robots_noindex),
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: displayName,
      images: [{ url: ogImage, width: ogDims.width, height: ogDims.height, alt: displayName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function DealerInventoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { make, model, min, max, q } = await searchParams

  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error: orgErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    INVENTORY_ORG_PAGE_SELECT,
    { onlyPublicInventory: true },
  )
  const { row: org, ambiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as InventoryOrgPageRow[],
    slugNorm,
  )
  if (orgErr || ambiguous || !org) notFound()

  const orgSlug = org.slug as string

  let query = supabase
    .from('vehicles')
    .select('id, year, make, model, trim, color, mileage, price, photo_url, public_slug, status, stock_no')
    .eq('user_id', org.id)
    .eq('published', true)
    .neq('status', 'sold')
    .order('created_at', { ascending: false })
    .limit(100)

  if (make) query = query.ilike('make', make)
  if (model) query = query.ilike('model', model)
  if (min) query = query.gte('price', parseInt(min))
  if (max) query = query.lte('price', parseInt(max))
  if (q) {
    const term = `%${q}%`
    query = query.or(`make.ilike.${term},model.ilike.${term}`)
  }

  const { data: vehicles } = await query

  const { data: makeRows } = await supabase
    .from('vehicles')
    .select('make')
    .eq('user_id', org.id)
    .eq('published', true)
    .neq('status', 'sold')

  const makes = [...new Set((makeRows ?? []).map(r => r.make).filter(Boolean))].sort()

  const count = vehicles?.length ?? 0

  const specialtyTags = Array.isArray(org.website_specialty_tags)
    ? (org.website_specialty_tags as string[]).filter(Boolean)
    : []
  const heroScript =
    org.website_hero_subline?.trim() ||
    org.website_tagline?.trim() ||
    'Quality pre-owned vehicles'
  const heroTitle = org.website_hero_headline?.trim() || 'Browse our inventory'
  const serviceArea = org.website_service_area?.trim() || null

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: count,
    itemListElement: (vehicles ?? []).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${v.year} ${v.make} ${v.model}`,
      url: absoluteUrl(`/${orgSlug}/inventory/${v.public_slug ?? v.id}`),
    })),
  }

  return (
    <>
      <div className="mx-auto max-w-5xl py-2 font-[family-name:var(--font-dp-body)] sm:py-4">
        <div className="mb-6 rounded-2xl border border-[var(--dp-gold)]/25 bg-gradient-to-br from-[var(--dp-navy)] to-[var(--dp-navy-deep)] px-6 py-8 text-white shadow-lg">
          <p className="font-[family-name:var(--font-dp-script)] text-2xl text-[var(--dp-gold-light)] md:text-3xl">
            {heroScript}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-dp-display)] text-3xl font-semibold tracking-tight md:text-4xl">
            {heroTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80 md:text-base">
            {count === 0
              ? 'New arrivals are added regularly — check back soon or call us today.'
              : `${count} ${count === 1 ? 'vehicle' : 'vehicles'} available now. Filter by make, price, or keyword.`}
          </p>
          {specialtyTags.length ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Specialties">
              {specialtyTags.map(t => (
                <li
                  key={t}
                  className="rounded-full border border-[var(--dp-gold)]/40 bg-[var(--dp-navy-light)]/50 px-3 py-1 text-xs font-medium text-[var(--dp-gold-light)]"
                >
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          {serviceArea ? (
            <p className="mt-4 text-sm text-white/75 border-t border-white/10 pt-4">{serviceArea}</p>
          ) : null}
        </div>

        {org.website_about?.trim() ? (
          <DealerPublicAboutSection about={org.website_about.trim()} />
        ) : null}

        <div className="mb-5">
          <h2 className="font-[family-name:var(--font-dp-display)] text-xl font-semibold text-[var(--dp-navy)]">
            Inventory
            <span className="ml-2 text-base font-normal text-[var(--dp-ink)]/60">
              ({count} {count === 1 ? 'vehicle' : 'vehicles'})
            </span>
          </h2>
        </div>

        <InventoryFilters makes={makes} currentMake={make} currentMin={min} currentMax={max} currentQ={q} />

        {!vehicles?.length ? (
          <div className="rounded-xl border border-[var(--dp-navy)]/10 bg-[var(--dp-warm-white)] py-16 text-center text-[var(--dp-ink)]/70">
            <p className="text-lg font-medium text-[var(--dp-navy)]">No vehicles match your search.</p>
            <Link
              href={`/${orgSlug}/inventory`}
              className="mt-3 inline-block text-sm font-medium text-[var(--dp-navy)] underline-offset-2 hover:underline"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {vehicles.map(vehicle => (
              <article
                key={vehicle.id}
                className="flex flex-col overflow-hidden rounded-xl border border-[var(--dp-navy)]/10 bg-[var(--dp-warm-white)] shadow-sm transition-shadow hover:shadow-md sm:flex-row"
              >
                <div className="aspect-video overflow-hidden bg-[var(--dp-cream)] sm:aspect-auto sm:w-72 sm:shrink-0">
                  {vehicle.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={vehicle.photo_url}
                      alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full min-h-[160px] object-cover"
                    />
                  ) : (
                    <div className="flex min-h-[160px] w-full items-center justify-center text-[var(--dp-ink)]/20">
                      <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM7 7l3-3 3 3M5 7h14l1 5H4L5 7z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold leading-snug text-[var(--dp-navy)]">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h3>
                    {vehicle.trim ? <p className="mt-0.5 text-sm text-[var(--dp-ink)]/60">{vehicle.trim}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {vehicle.mileage ? (
                        <span className="text-xs text-[var(--dp-ink)]/55">{formatMileage(vehicle.mileage)}</span>
                      ) : null}
                      {vehicle.mileage && vehicle.color ? (
                        <span className="text-xs text-[var(--dp-ink)]/30">·</span>
                      ) : null}
                      {vehicle.color ? (
                        <span className="text-xs text-[var(--dp-ink)]/55">{vehicle.color}</span>
                      ) : null}
                    </div>
                    {vehicle.stock_no ? (
                      <p className="mt-1 text-xs text-[var(--dp-ink)]/45">Stock # {vehicle.stock_no}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0 sm:text-right">
                    <p className="text-2xl font-bold leading-none text-[var(--dp-navy)]">
                      {formatPrice(vehicle.price)}
                    </p>
                    <Link
                      href={`/${orgSlug}/inventory/${vehicle.public_slug ?? vehicle.id}`}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[var(--dp-gold)] bg-[var(--dp-gold)] px-4 py-2 text-sm font-semibold text-[var(--dp-navy)] transition-[filter] hover:brightness-105"
                    >
                      View details
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdInline(itemListLd) }}
        suppressHydrationWarning
      />
    </>
  )
}
