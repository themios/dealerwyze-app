import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import ActivityTimeline from '@/components/customer/ActivityTimeline'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import VehicleSoldButton from '@/components/vehicle/VehicleSoldButton'
import VehicleDocuments from '@/components/vehicle/VehicleDocuments'
import VehiclePhotos from '@/components/vehicle/VehiclePhotos'
import ShareVehicleSheet from '@/components/vehicle/ShareVehicleSheet'
import MarketIntelligenceCard from '@/components/vehicles/MarketIntelligenceCard'
import ReconSection from '@/components/vehicle/ReconSection'
import BuySheetCard from '@/components/vehicle/BuySheetCard'
import MechanicWorksheetCard from '@/components/vehicle/MechanicWorksheetCard'
import VehicleMarkReadyButton from '@/components/vehicle/VehicleMarkReadyButton'
import VehicleRestoreButton from '@/components/vehicle/VehicleRestoreButton'
import { canAccessLedger, isDealerAdmin } from '@/lib/auth/dealerRoles'
import VehicleVideoSection from '@/components/vehicles/VehicleVideoSection'
import InlinePriceEdit from '@/components/vehicle/InlinePriceEdit'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const statusColors: Record<string, string> = {
  available: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  sold: 'bg-muted text-muted-foreground',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const isAdmin = profile.role === 'admin'
  const canEdit = canAccessLedger(profile.role)
  const canDelete = isDealerAdmin(profile.role) || profile.role === 'dealer_manager'
  const [{ data: vehicle }, { data: activities }, { data: leads }, { data: org }, { data: vehiclePhotos }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', id).eq('user_id', profile.org_id).single(),
    supabase.from('activities').select('*, customer:customers(id, name, primary_phone)').eq('vehicle_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('customer_vehicles').select('*, customer:customers(id, name, primary_phone)').eq('vehicle_id', id).order('created_at', { ascending: false }),
    supabase.from('organizations').select('slug').eq('id', profile.org_id).single(),
    supabase.from('vehicle_photos').select('url').eq('vehicle_id', id).order('position').limit(8),
  ])

  if (!vehicle) notFound()

  return (
    <div>
      <TopBar
        title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        right={
          <div className="flex items-center gap-1">
            {vehicle.status === 'staging' && canDelete && (
              <VehicleMarkReadyButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {isAdmin && vehicle.status !== 'sold' && vehicle.status !== 'staging' && (
              <VehicleSoldButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {isAdmin && vehicle.status === 'sold' && (
              <VehicleRestoreButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {vehicle.published && vehicle.public_slug && org && (
              <ShareVehicleSheet
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                publicUrl={`https://dealerwyze.com/${org.slug}/inventory/${vehicle.public_slug}`}
              />
            )}
            <Link href={`/vehicles/${id}/edit`} title="Edit vehicle">
              <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
            </Link>
            <Link href="/vehicles" title="Back to inventory">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* Compact details + price */}
        {(() => {
          const details = [
            vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null,
            vehicle.color || null,
            vehicle.trim || null,
          ].filter(Boolean).join(' · ')
          // Stock numbers that look like URL slugs (web-year-make-model) are not real stock numbers
          const isSlug = vehicle.stock_no && /^web-\d{4}-/.test(vehicle.stock_no)
          const stockNo = !isSlug ? vehicle.stock_no : null
          // Always render the details block (VIN always shown)
          return (
            <div className="space-y-0.5">
              {details && <p className="text-xs text-muted-foreground">{details}</p>}
              <p className="text-xs text-muted-foreground font-mono">VIN: {vehicle.vin || '—'}</p>
              {stockNo && <p className="text-xs text-muted-foreground truncate">Stock: {stockNo}</p>}
            </div>
          )
        })()}

        {/* Price + Status + Market Intelligence */}
        <div className="flex items-center justify-between">
          {canEdit && vehicle.status !== 'sold' ? (
            <InlinePriceEdit vehicleId={id} initialPrice={vehicle.price ?? null} />
          ) : vehicle.price ? (
            <p className="text-3xl font-bold">{formatCurrency(vehicle.price)}</p>
          ) : (
            <p className="text-muted-foreground">No price set</p>
          )}
          <span className={`text-sm font-medium px-3 py-1 rounded-full capitalize ${statusColors[vehicle.status]}`}>
            {vehicle.status}
          </span>
        </div>

        <MarketIntelligenceCard
          vehicleId={id}
          vehicleStatus={vehicle.status}
          initialData={(vehicle.market_data_json as any) ?? null}
          initialRecallCount={vehicle.nhtsa_recall_count ?? null}
          initialReliabilityTier={vehicle.reliability_tier ?? null}
        />

        {vehicle.notes && (
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{vehicle.notes}</p>
          </div>
        )}

        {/* Buy Sheet (acquisition details) */}
        {canEdit && (vehicle.status === 'staging' || vehicle.status === 'available' || vehicle.status === 'pending') && (
          <BuySheetCard
            vehicleId={id}
            initial={{
              purchase_price:    vehicle.purchase_price    ?? null,
              purchased_at:      vehicle.purchased_at      ?? null,
              purchased_from:    vehicle.purchased_from    ?? null,
              acquisition_source: (vehicle as Record<string, unknown>).acquisition_source as string | null ?? null,
              auction_name:      (vehicle as Record<string, unknown>).auction_name as string | null ?? null,
              auction_lot:       (vehicle as Record<string, unknown>).auction_lot  as string | null ?? null,
              floor_plan_amount: (vehicle as Record<string, unknown>).floor_plan_amount as number | null ?? null,
              acquisition_notes: (vehicle as Record<string, unknown>).acquisition_notes as string | null ?? null,
            }}
          />
        )}

        {/* Recon Checklist (staging, available, pending) */}
        {(vehicle.status === 'staging' || vehicle.status === 'available' || vehicle.status === 'pending') && (
          <>
            <div className="border rounded-xl overflow-hidden">
              <ReconSection
                vehicleId={id}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            </div>
            <MechanicWorksheetCard vehicleId={id} canEdit={canEdit} />
          </>
        )}

        {/* Sale details (sold vehicles) */}
        {vehicle.status === 'sold' && vehicle.sold_price && (
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sale Details</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Sale Price</p>
                <p className="font-semibold">{formatCurrency(vehicle.sold_price)}</p>
              </div>
              {vehicle.finance_type && (
                <div>
                  <p className="text-xs text-muted-foreground">Finance Type</p>
                  <p className="font-semibold capitalize">{vehicle.finance_type === 'bhph' ? 'BHPH' : vehicle.finance_type}</p>
                </div>
              )}
              {vehicle.finance_company && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Finance Company</p>
                  <p className="font-semibold">{vehicle.finance_company}</p>
                </div>
              )}
              {vehicle.sold_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Sold Date</p>
                  <p className="font-semibold">{new Date(vehicle.sold_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Leads */}
        {leads && leads.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Leads ({leads.length})</p>
            <div className="space-y-2">
              {leads.map((lead: any) => (
                <Link key={lead.id} href={`/customers/${lead.customer.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors">
                    <div>
                      <p className="font-medium text-sm">{lead.customer.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.customer.primary_phone}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      lead.interest_level === 'hot' ? 'bg-red-500/10 text-red-600' :
                      lead.interest_level === 'warm' ? 'bg-yellow-500/10 text-yellow-600' :
                      'bg-blue-500/10 text-blue-600'
                    }`}>
                      {lead.interest_level}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        <VehiclePhotos vehicleId={id} />

        {/* Video & Social */}
        {vehicle.status !== 'sold' && (
          <VehicleVideoSection
            vehicleId={id}
            vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            photos={
              vehiclePhotos?.map((p: Record<string, string>) => p.url).filter(Boolean) ??
              (vehicle.photo_url ? [vehicle.photo_url] : [])
            }
          />
        )}

        {/* Documents */}
        <VehicleDocuments vehicleId={id} vehicleStatus={vehicle.status} />

        {/* Activity timeline */}
        {activities && activities.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity</p>
            <ActivityTimeline activities={activities || []} />
          </div>
        )}
      </div>
    </div>
  )
}
