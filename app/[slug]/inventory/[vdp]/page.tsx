import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import ContactForm from './ContactForm'
import TradeInForm from './TradeInForm'
import PhotoCarousel from './PhotoCarousel'
import PriceHistory from './PriceHistory'
import ViewCounter from './ViewCounter'

export const revalidate = 300

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vdp } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!org) return {}

  const { data: v } = await supabase
    .from('vehicles')
    .select('year, make, model, trim, price, mileage, photo_url')
    .eq('user_id', org.id)
    .eq('public_slug', vdp)
    .eq('published', true)
    .single()

  if (!v) return {}

  const title = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''} - ${org.name}`
  const description = `${formatMileage(v.mileage)}, ${formatPrice(v.price)}. Contact ${org.name} today.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: v.photo_url ? [{ url: v.photo_url }] : [],
      type: 'website',
    },
  }
}

export default async function VdpPage({ params }: Props) {
  const { slug, vdp } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, public_inventory_enabled')
    .eq('slug', slug)
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) notFound()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim, color, mileage, price, photo_url, notes, stock_no, vin, status, price_history, views_count, public_slug')
    .eq('user_id', org.id)
    .eq('public_slug', vdp)
    .eq('published', true)
    .single()

  if (!vehicle || vehicle.status === 'sold') notFound()

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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`,
    vehicleModelDate: String(vehicle.year),
    brand: { '@type': 'Brand', name: vehicle.make },
    model: vehicle.model,
    vehicleConfiguration: vehicle.trim ?? undefined,
    color: vehicle.color ?? undefined,
    ...(vehicle.vin ? { vehicleIdentificationNumber: vehicle.vin } : {}),
    ...(vehicle.mileage ? {
      mileageFromOdometer: {
        '@type': 'QuantitativeValue',
        value: vehicle.mileage,
        unitCode: 'SMI',
      },
    } : {}),
    offers: {
      '@type': 'Offer',
      price: vehicle.price ? String(vehicle.price) : undefined,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', name: org.name },
    },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ViewCounter vehicleId={vehicle.id} />

      {/* Back link */}
      <a href={`/${slug}/inventory`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-6">
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
            <h1 className="text-2xl font-bold text-gray-900">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim && <span className="text-gray-500 font-normal"> {vehicle.trim}</span>}
            </h1>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-3xl font-bold text-gray-900">{formatPrice(vehicle.price)}</span>
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
              slug={slug}
              vdp={vehicle.public_slug ?? vdp}
              vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            />
            <TradeInForm
              slug={slug}
              vdp={vehicle.public_slug ?? vdp}
              vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            />
          </div>
        </div>
      </div>
    </>
  )
}
