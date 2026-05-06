import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { absoluteUrl, getPublicAppBaseUrl } from '@/lib/dealer-public/site'
import {
  extractCityFromAddress,
  vdpMetaDescriptionFallback,
} from '@/lib/dealer-public/personalization'
import {
  loadOrganizationsMatchingPublicSlug,
  pickUniqueOrgSlugMatch,
} from '@/lib/dealer-public/publicOrgBySlug'
import { flattenOverviewForMeta, parseOverviewSections } from '@/lib/vehicles/overviewSections'
import PublicVehicleOverview from '@/components/dealer-public/PublicVehicleOverview'
import PublicVehicleReportDownloads from '@/components/dealer-public/PublicVehicleReportDownloads'
import { getWebsiteDocumentsForPublicVdp } from '@/lib/vehicles/publicVehicleDocuments'
import ContactForm from './ContactForm'
import VdpJsonLd from './VdpJsonLd'
import TradeInForm from './TradeInForm'
import PhotoCarousel from './PhotoCarousel'
import PriceHistory from './PriceHistory'
import ViewCounter from './ViewCounter'

const VDP_ORG_META_SELECT = `id, name, slug, website_contact_address, website_service_area, website_specialty_tags,
      website_robots_noindex, website_og_image_url, website_logo_url`

const VDP_ORG_PAGE_SELECT = 'id, name, public_inventory_enabled, slug'

interface VdpOrgMetaRow {
  slug: string
  id: string
  name: string
  website_contact_address: string | null
  website_service_area: string | null
  website_specialty_tags: unknown
  website_robots_noindex: boolean | null
  website_og_image_url: string | null
  website_logo_url: string | null
}

export const dynamic = 'force-dynamic'

const VEHICLE_PUBLIC_SELECT =
  'id, year, make, model, trim, color, mileage, price, photo_url, notes, stock_no, vin, status, price_history, views_count, public_slug, ai_description'

const UUID_IN_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeSegment(s: string) {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

interface Props {
  params: Promise<{ slug: string; vdp: string }>
}

function formatPrice(price: number | null): string {
  if (!price) return 'Call for price'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
}

function formatMileage(miles: number | null): string {
  if (!miles) return 'N/A'
  return new Intl.NumberFormat('en-US').format(miles) + ' miles'
}

/** Plain text for meta tags — collapse whitespace, cap length (no HTML). */
function metaDescriptionFromAi(text: string | null | undefined, maxLen: number): string | null {
  if (!text?.trim()) return null
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= maxLen ? oneLine : oneLine.slice(0, maxLen).trimEnd()
}

function vdpRobots(noindex: boolean | null | undefined): Metadata['robots'] {
  if (noindex) return { index: false, follow: false }
  return { index: true, follow: true }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vdp } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSegment(slug)
  const vdpNorm = normalizeSegment(vdp)

  const { rows, error: metaErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    VDP_ORG_META_SELECT,
    { onlyPublicInventory: true },
  )
  if (metaErr) return {}
  const { row: org, ambiguous: metaAmbiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as VdpOrgMetaRow[],
    slugNorm,
  )
  if (!org || metaAmbiguous) return {}

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, business_address')
    .eq('org_id', org.id)
    .maybeSingle()

  const displayName = settings?.business_name?.trim() || org.name
  const addressLine = org.website_contact_address?.trim() || settings?.business_address?.trim() || null
  const serviceArea = org.website_service_area?.trim() || null
  const city = extractCityFromAddress(addressLine, serviceArea)
  const specialtyTags = Array.isArray(org.website_specialty_tags)
    ? (org.website_specialty_tags as string[]).filter(Boolean).slice(0, 4)
    : null

  let { data: v } = await supabase
    .from('vehicles')
    .select('year, make, model, trim, price, mileage, photo_url, ai_description, status')
    .eq('user_id', org.id)
    .eq('public_slug', vdpNorm)
    .eq('published', true)
    .neq('status', 'sold')
    .maybeSingle()

  if (!v && UUID_IN_PATH.test(vdpNorm)) {
    const r = await supabase
      .from('vehicles')
      .select('year, make, model, trim, price, mileage, photo_url, ai_description, status')
      .eq('user_id', org.id)
      .eq('id', vdpNorm)
      .eq('published', true)
      .neq('status', 'sold')
      .maybeSingle()
    v = r.data
  }

  if (!v) return {}

  const title = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''} for sale${city ? ` in ${city}` : ''} — ${displayName}`
  const overviewMeta = flattenOverviewForMeta(v.ai_description, 160)
  const description =
    (overviewMeta.trim() ? overviewMeta : null) ??
    metaDescriptionFromAi(v.ai_description, 160) ??
    vdpMetaDescriptionFallback({
      year: v.year,
      make: v.make,
      model: v.model,
      mileage: v.mileage,
      price: v.price,
      dealerName: displayName,
      city,
      specialtyTags,
    })

  const canonicalPath = `/${slugNorm}/inventory/${vdpNorm}`
  const canonical = absoluteUrl(canonicalPath)
  const ogDealer = org.website_og_image_url?.trim() || org.website_logo_url?.trim() || null
  const ogImages = [v.photo_url, ogDealer].filter((u): u is string => Boolean(u?.trim())).map(u => ({ url: u.trim() }))

  return {
    metadataBase: new URL(getPublicAppBaseUrl()),
    title,
    description,
    alternates: { canonical },
    robots: vdpRobots(org.website_robots_noindex),
    openGraph: {
      title,
      description,
      url: canonical,
      ...(ogImages.length ? { images: ogImages } : {}),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImages.length ? { images: ogImages.map(i => i.url) } : {}),
    },
  }
}

export default async function VdpPage({ params }: Props) {
  const { slug, vdp } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSegment(slug)
  const vdpNorm = normalizeSegment(vdp)

  const { rows, error: orgErr } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    VDP_ORG_PAGE_SELECT,
    { onlyPublicInventory: false },
  )
  const { row: org, ambiguous } = pickUniqueOrgSlugMatch(
    rows as unknown as {
      slug: string
      id: string
      name: string
      public_inventory_enabled: boolean | null
    }[],
    slugNorm,
  )
  if (orgErr || ambiguous || !org || org.public_inventory_enabled !== true) notFound()

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('business_name, business_address')
    .eq('org_id', org.id)
    .maybeSingle()

  const displayName = orgSettings?.business_name?.trim() || org.name

  let { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select(VEHICLE_PUBLIC_SELECT)
    .eq('user_id', org.id)
    .eq('public_slug', vdpNorm)
    .eq('published', true)
    .neq('status', 'sold')
    .maybeSingle()

  if (!vehicle && UUID_IN_PATH.test(vdpNorm)) {
    const r = await supabase
      .from('vehicles')
      .select(VEHICLE_PUBLIC_SELECT)
      .eq('user_id', org.id)
      .eq('id', vdpNorm)
      .eq('published', true)
      .neq('status', 'sold')
      .maybeSingle()
    vehicle = r.data
    vehicleError = r.error
  }

  if (vehicleError || !vehicle) notFound()

  if (vehicle.public_slug && vehicle.public_slug !== vdpNorm) {
    redirect(`/${org.slug}/inventory/${vehicle.public_slug}`)
  }

  // Fetch photos for carousel
  const { data: photos } = await supabase
    .from('vehicle_photos')
    .select('id, url')
    .eq('vehicle_id', vehicle.id)
    .order('position')

  // Fall back to legacy photo_url if no photos in table yet
  const carouselPhotos = photos && photos.length > 0
    ? photos
    : vehicle.photo_url
      ? [{ id: 'legacy', url: vehicle.photo_url }]
      : []

  const base = getPublicAppBaseUrl()
  const dealerId = `${base}/#dealer-${org.slug}`
  const siteRootUrl = absoluteUrl(`/${org.slug}`)
  const inventoryUrl = absoluteUrl(`/${org.slug}/inventory`)
  const vdpUrl = absoluteUrl(`/${org.slug}/inventory/${vehicle.public_slug ?? vdpNorm}`)
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`

  const overviewSections = parseOverviewSections(vehicle.ai_description)
  const overviewLd =
    flattenOverviewForMeta(vehicle.ai_description, 600).trim() || vehicle.ai_description?.trim() || null

  const websiteDownloads = await getWebsiteDocumentsForPublicVdp(org.id, vehicle.id)

  const carNode: Record<string, unknown> = {
    '@type': 'Car',
    '@id': `${vdpUrl}#vehicle`,
    name: vehicleName,
    url: vdpUrl,
    description: overviewLd ?? vehicle.notes ?? undefined,
    vehicleModelDate: String(vehicle.year),
    brand: { '@type': 'Brand', name: vehicle.make },
    model: vehicle.model,
    vehicleConfiguration: vehicle.trim ?? undefined,
    color: vehicle.color ?? undefined,
    vehicleCondition: 'https://schema.org/UsedCondition',
    ...(vehicle.vin ? { vehicleIdentificationNumber: vehicle.vin } : {}),
    ...(vehicle.mileage
      ? {
          mileageFromOdometer: {
            '@type': 'QuantitativeValue',
            value: vehicle.mileage,
            unitCode: 'SMI',
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      price: vehicle.price ? String(vehicle.price) : undefined,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: vdpUrl,
      seller: { '@id': dealerId },
    },
  }

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: displayName,
        item: siteRootUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Inventory',
        item: inventoryUrl,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        item: vdpUrl,
      },
    ],
  }

  const dealerNode = {
    '@type': 'AutoDealer',
    '@id': dealerId,
    name: displayName,
    url: inventoryUrl,
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [carNode, breadcrumbNode, dealerNode],
  }

  const specs = [
    { label: 'Year', value: vehicle.year },
    { label: 'Make', value: vehicle.make },
    { label: 'Model', value: vehicle.model },
    { label: 'Trim', value: vehicle.trim },
    { label: 'Color', value: vehicle.color },
    { label: 'Mileage', value: vehicle.mileage ? formatMileage(vehicle.mileage) : null },
    { label: 'Stock #', value: vehicle.stock_no },
    { label: 'VIN', value: vehicle.vin },
  ].filter(s => s.value)

  return (
    <>
      <ViewCounter vehicleId={vehicle.id} />

      {/* Back link */}
      <a
        href={`/${org.slug}/inventory`}
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-[var(--dp-navy)] underline-offset-2 hover:underline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to inventory
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: photo + specs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Photo carousel */}
          <PhotoCarousel
            photos={carouselPhotos}
            vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          />

          {/* Title + price */}
          <div>
            <h1 className="font-[family-name:var(--font-dp-display)] text-2xl font-bold text-[var(--dp-navy)]">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim && <span className="text-gray-500 font-normal"> {vehicle.trim}</span>}
            </h1>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-3xl font-bold text-[var(--dp-navy)]">{formatPrice(vehicle.price)}</span>
              {vehicle.mileage && (
                <span className="text-gray-500">{formatMileage(vehicle.mileage)}</span>
              )}
            </div>
          </div>

          {/* Specs table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Vehicle Details</h2>
            </div>
            <dl className="divide-y divide-gray-100">
              {specs.map(spec => (
                <div key={spec.label} className="flex px-4 py-2.5 text-sm">
                  <dt className="w-28 text-gray-500 shrink-0">{spec.label}</dt>
                  <dd className="font-medium text-gray-900">{String(spec.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {vehicle.vin && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--dp-navy)]/15 bg-[var(--dp-cream)] p-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--dp-navy)]">Want an independent vehicle report?</p>
                <p className="mt-0.5 text-xs text-[var(--dp-ink)]/75">
                  VinWyze provides evidence-backed research including history document analysis — independent of the
                  dealer.
                </p>
              </div>
              <a
                href={`https://vinwyze.com?vin=${encodeURIComponent(vehicle.vin)}&ref=${encodeURIComponent(org.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 shrink-0 text-xs font-semibold text-[var(--dp-navy)] underline underline-offset-2 hover:opacity-90"
              >
                Get report →
              </a>
            </div>
          )}

          {overviewSections.length > 0 ? <PublicVehicleOverview sections={overviewSections} /> : null}

          {websiteDownloads.length > 0 ? <PublicVehicleReportDownloads docs={websiteDownloads} /> : null}

          {/* Notes */}
          {vehicle.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2">Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicle.notes}</p>
            </div>
          )}

          {/* Price history */}
          {Array.isArray(vehicle.price_history) && vehicle.price_history.length > 0 && (
            <PriceHistory history={vehicle.price_history} />
          )}
        </div>

        {/* Right: contact form */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <ContactForm
              slug={org.slug}
              vdp={vehicle.public_slug ?? vdpNorm}
              vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            />
            <TradeInForm
              slug={org.slug}
              vdp={vehicle.public_slug ?? vdpNorm}
              vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            />
          </div>
        </div>
      </div>

      <VdpJsonLd payload={jsonLd} />
    </>
  )
}
