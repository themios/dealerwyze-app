import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import InventoryFilters from './InventoryFilters'

export const revalidate = 300 // ISR: revalidate every 5 minutes

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ make?: string; model?: string; min?: string; max?: string }>
}

function formatPrice(price: number | null): string {
  if (!price) return 'Call for price'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
}

function formatMileage(miles: number | null): string {
  if (!miles) return ''
  return new Intl.NumberFormat('en-US').format(miles) + ' mi'
}

export default async function DealerInventoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { make, model, min, max } = await searchParams

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) notFound()

  // Build vehicle query
  let query = supabase
    .from('vehicles')
    .select('id, year, make, model, trim, color, mileage, price, photo_url, public_slug, status')
    .eq('user_id', org.id)
    .eq('published', true)
    .neq('status', 'sold')
    .order('created_at', { ascending: false })
    .limit(100)

  if (make) query = query.ilike('make', make)
  if (model) query = query.ilike('model', model)
  if (min) query = query.gte('price', parseInt(min))
  if (max) query = query.lte('price', parseInt(max))

  const { data: vehicles } = await query

  // Get distinct makes for filter
  const { data: makeRows } = await supabase
    .from('vehicles')
    .select('make')
    .eq('user_id', org.id)
    .eq('published', true)
    .neq('status', 'sold')

  const makes = [...new Set((makeRows ?? []).map(r => r.make).filter(Boolean))].sort()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Available Inventory
          <span className="ml-2 text-base font-normal text-gray-500">
            ({vehicles?.length ?? 0} vehicles)
          </span>
        </h2>
      </div>

      <InventoryFilters makes={makes} currentMake={make} currentMin={min} currentMax={max} />

      {!vehicles?.length ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">No vehicles match your search.</p>
          <Link href={`/${slug}/inventory`} className="mt-2 text-blue-600 hover:underline text-sm">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {vehicles.map(vehicle => (
            <Link
              key={vehicle.id}
              href={`/${slug}/inventory/${vehicle.public_slug ?? vehicle.id}`}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group"
            >
              {/* Photo */}
              <div className="aspect-video bg-gray-100 overflow-hidden">
                {vehicle.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vehicle.photo_url}
                    alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM7 7l3-3 3 3M5 7h14l1 5H4L5 7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                  {vehicle.trim && <span className="text-gray-500 font-normal"> {vehicle.trim}</span>}
                </h3>
                {vehicle.color && (
                  <p className="text-xs text-gray-500 mt-0.5">{vehicle.color}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-lg font-bold text-gray-900">{formatPrice(vehicle.price)}</span>
                  {vehicle.mileage && (
                    <span className="text-sm text-gray-500">{formatMileage(vehicle.mileage)}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
