import type { ReactNode } from 'react'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
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
import MarketIntelligenceCard, { type MarketData } from '@/components/vehicles/MarketIntelligenceCard'
import VehicleOverviewSection from '@/components/vehicle/VehicleOverviewSection'
import VehicleVinLine from '@/components/vehicle/VehicleVinLine'
import ReconSection from '@/components/vehicle/ReconSection'
import BuySheetCard from '@/components/vehicle/BuySheetCard'
import MechanicWorksheetCard from '@/components/vehicle/MechanicWorksheetCard'
import VehicleMarkReadyButton from '@/components/vehicle/VehicleMarkReadyButton'
import VehicleRestoreButton from '@/components/vehicle/VehicleRestoreButton'
import { canAccessLedger, isDealerAdmin } from '@/lib/auth/dealerRoles'
import VehiclePublishToggle from '@/components/vehicle/VehiclePublishToggle'
import VehicleListingDescriptionCard from '@/components/vehicle/VehicleListingDescriptionCard'
import InlinePriceEdit from '@/components/vehicle/InlinePriceEdit'
import { demandSignalShortLabel } from '@/lib/intelligence/demandLabels'
import VehicleDetailSectionPicker from '@/components/vehicle/VehicleDetailSectionPicker'
import ListingPerformanceCard from '@/components/vehicle/ListingPerformanceCard'
import TransactionPanel from '@/components/transactions/TransactionPanel'
import {
  VEHICLE_DETAIL_SECTION_IDS,
  uniqueNavSections,
  type VehicleDetailNavItem,
} from '@/lib/vehicles/vehicleDetailSectionIds'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

type VehicleLead = {
  id: string
  interest_level: string | null
  customer: {
    id: string
    name: string | null
    primary_phone: string | null
  } | null
}

const statusColors: Record<string, string> = {
  available: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  sold: 'bg-muted text-muted-foreground',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

function formatMileage(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return `${new Intl.NumberFormat('en-US').format(value)} mi`
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value))
}

function formatVin(value: unknown) {
  if (typeof value !== 'string') return '—'
  const vin = value.trim()
  return vin || '—'
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2 mb-1">
      {children}
    </p>
  )
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const isAdmin = profile.role === 'admin'
  const canEdit = canAccessLedger(profile.role)
  const canDelete = isDealerAdmin(profile.role) || profile.role === 'dealer_manager'
  const [
    { data: vehicle },
    { data: activities },
    { data: leads },
    { data: org },
    { data: latestDoc },
    { data: vehicleRec },
  ] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', id).eq('user_id', profile.org_id).single(),
    supabase
      .from('activities')
      .select('*, customer:customers(id, name, primary_phone)')
      .eq('vehicle_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('customer_vehicles')
      .select('*, customer:customers(id, name, primary_phone)')
      .eq('vehicle_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('organizations').select('slug, public_inventory_enabled, vertical').eq('id', profile.org_id).single(),
    supabase
      .from('vehicle_documents')
      .select('created_at')
      .eq('vehicle_id', id)
      .eq('user_id', profile.org_id)
      .eq('document_scope', 'website')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('recommendations')
      .select('id, title, body, priority')
      .eq('org_id', profile.org_id)
      .eq('entity_type', 'vehicle')
      .eq('entity_id', id)
      .is('dismissed_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ])

  if (!vehicle) notFound()

  // Resolve who has close authority for transaction confirmation:
  // - 1 org member → they have all authority regardless of role
  // - Multiple members → owner/admin role has authority
  const isReOrg = org?.vertical === 'real_estate'
  let brokerName: string | null = null
  // Use service client for member count — createClientForRequest RLS can restrict profiles visibility
  const svc = createServiceClient()
  const isOwnerOrAdmin = (profile.role as string) === 'owner' || profile.role === 'admin'
  let currentUserIsAuthority = isOwnerOrAdmin // always true if admin/owner regardless of member count
  if (isReOrg && !currentUserIsAuthority) {
    // Agent role — authority only if they're the sole org member
    const { count } = await svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
    const isSoleUser = (count ?? 0) <= 1
    currentUserIsAuthority = isSoleUser
    if (!currentUserIsAuthority) {
      // Find the admin to show their name
      const { data: admins } = await svc
        .from('profiles')
        .select('id')
        .eq('org_id', profile.org_id)
        .in('role', ['owner', 'admin'])
        .limit(1)
      if (admins?.[0]) {
        const { data: adminUser } = await svc.auth.admin.getUserById(admins[0].id)
        brokerName = adminUser?.user?.user_metadata?.full_name ?? adminUser?.user?.email ?? null
      }
    }
  }

  const isStale =
    latestDoc?.created_at != null &&
    (vehicle.ai_last_analyzed_at == null ||
      new Date(latestDoc.created_at) > new Date(vehicle.ai_last_analyzed_at))

  const showLeadIntel =
    vehicle.status !== 'sold' &&
    vehicle.status !== 'staging' &&
    Boolean(vehicle.demand_signal || (vehicle.lead_count_30d ?? 0) > 0)

  const isRe = (org?.vertical as string | null) === 'real_estate'

  // Dealer-only sections — hidden for RE (no recon, floor plan, or mechanic worksheet)
  const showAcquisition =
    !isRe &&
    canEdit &&
    (vehicle.status === 'staging' || vehicle.status === 'available' || vehicle.status === 'pending')

  const showOperations =
    !isRe &&
    (vehicle.status === 'staging' || vehicle.status === 'available' || vehicle.status === 'pending')

  const showSaleDetail = vehicle.status === 'sold' && vehicle.sold_price
  const showWebsiteOverviewPanel = canEdit && vehicle.status !== 'sold'

  const navSections: VehicleDetailNavItem[] = []
  navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.listing, label: 'Listing & market' })
  if (showAcquisition) navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.acquisition, label: 'Acquisition' })
  if (showOperations) navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.operations, label: 'Recon & shop' })
  if (showSaleDetail) navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.sale, label: isRe ? 'Closing' : 'Sale' })
  if (leads && leads.length > 0) {
    navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.customers, label: isRe ? 'Buyers' : 'Customers' })
  }
  navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.media, label: 'Social Media' })
  navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.inventory, label: isRe ? 'Listing details' : 'Inventory' })
  if (showWebsiteOverviewPanel) {
    navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.website, label: isRe ? 'Website' : 'Website' })
  }
  if (isRe) {
    navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.transactions, label: 'Transaction' })
  }
  if (activities && activities.length > 0) {
    navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.activity, label: 'Activity' })
  }

  // RE listing header line: beds/baths/sqft
  const reDetails = isRe ? [
    vehicle.bedrooms != null ? `${vehicle.bedrooms} bd` : null,
    vehicle.bathrooms != null ? `${vehicle.bathrooms} ba` : null,
    vehicle.sqft ? `${(vehicle.sqft as number).toLocaleString()} sqft` : null,
    vehicle.property_type ?? null,
  ].filter(Boolean).join(' · ') : null

  const details = isRe
    ? reDetails
    : [formatMileage(vehicle.mileage as number | null), vehicle.color || null, vehicle.trim || null]
        .filter(Boolean)
        .join(' · ')

  const isSlug = vehicle.stock_no && /^web-\d{4}-/.test(vehicle.stock_no)
  const stockNo = !isSlug ? vehicle.stock_no : null
  const vin = formatVin(isRe ? (vehicle.mls_number ?? null) : vehicle.vin)

  const uniqSections = uniqueNavSections(navSections)

  const panels: Partial<Record<string, ReactNode>> = {
    [VEHICLE_DETAIL_SECTION_IDS.listing]: (
      <div className="space-y-4">
        <SectionHeading>Listing & market</SectionHeading>

        <div className="space-y-0.5">
          {details ? <p className="text-xs text-muted-foreground">{details}</p> : null}
          {isRe ? (
            vehicle.mls_number
              ? <p className="text-xs text-muted-foreground font-mono">MLS#: {vehicle.mls_number as string}</p>
              : null
          ) : (
            <VehicleVinLine display={vin} />
          )}
          {isRe
            ? (vehicle.address_line1 ? <p className="text-xs text-muted-foreground truncate">{[vehicle.address_line1, vehicle.city, vehicle.state].filter(Boolean).join(', ')}</p> : null)
            : (stockNo ? <p className="text-xs text-muted-foreground truncate">Stock: {stockNo}</p> : null)
          }
        </div>

        {vehicleRec ? (
          <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/25 px-3 py-2 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">{vehicleRec.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{vehicleRec.body}</p>
          </div>
        ) : null}

        {showLeadIntel ? (
          <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/25 px-3 py-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Lead intelligence
            </p>
            <p className="text-foreground">
              {vehicle.demand_signal ? (
                <span className="font-medium text-amber-900 dark:text-amber-100">
                  {demandSignalShortLabel(vehicle.demand_signal)}
                </span>
              ) : (
                <span className="text-muted-foreground">Demand rollup</span>
              )}
              {(vehicle.lead_count_30d ?? 0) > 0 ? (
                <span className="text-muted-foreground"> · {vehicle.lead_count_30d} leads (30d)</span>
              ) : null}
              {vehicle.avg_intent_score != null ? (
                <span className="text-muted-foreground">
                  {' '}
                  · Avg intent {vehicle.avg_intent_score.toFixed(0)}
                </span>
              ) : null}
            </p>
            {vehicle.demand_updated_at ? (
              <p className="text-[10px] text-muted-foreground mt-1" suppressHydrationWarning>
                Updated {formatDate(vehicle.demand_updated_at)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {canEdit && vehicle.status !== 'sold' ? (
            <InlinePriceEdit vehicleId={id} initialPrice={vehicle.price ?? null} />
          ) : vehicle.price ? (
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{formatCurrency(vehicle.price)}</p>
          ) : (
            <p className="text-muted-foreground">No price set</p>
          )}
          <span
            className={`shrink-0 text-xs sm:text-sm font-medium px-3 py-1 rounded-full capitalize w-fit ${statusColors[vehicle.status]}`}
          >
            {vehicle.status}
          </span>
        </div>

        <MarketIntelligenceCard
          vehicleId={id}
          vehicleStatus={vehicle.status}
          initialData={(vehicle.market_data_json as MarketData | null) ?? null}
          initialRecallCount={vehicle.nhtsa_recall_count ?? null}
          initialReliabilityTier={vehicle.reliability_tier ?? null}
          showDescriptionSection={false}
        />

        {vehicle.notes ? (
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">{isRe ? 'Agent notes' : 'Dealer notes'}</p>
            <p className="text-sm leading-relaxed">{vehicle.notes}</p>
          </div>
        ) : null}

        {/* RE only: listing performance metrics + CMA */}
        {isRe && (
          <ListingPerformanceCard vehicleId={id} />
        )}

        {!showWebsiteOverviewPanel ? (
          <div className="space-y-2 pt-2">
            <SectionHeading>Shopper documents</SectionHeading>
            <VehicleDocuments vehicleId={id} vehicleStatus={vehicle.status} documentScope="website" />
          </div>
        ) : null}
      </div>
    ),

    [VEHICLE_DETAIL_SECTION_IDS.media]: (
      <div className="space-y-4">
        <SectionHeading>Social Media</SectionHeading>
        {vehicle.status === 'sold' ? (
          <p className="text-xs text-muted-foreground">
            Video creation is unavailable for sold vehicles — you can still view existing listing photos below.
          </p>
        ) : null}
        <VehiclePhotos
          vehicleId={id}
          vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          showVideoSection={vehicle.status !== 'sold'}
        />
      </div>
    ),

    [VEHICLE_DETAIL_SECTION_IDS.inventory]: (
      <div className="space-y-3">
        <SectionHeading>{isRe ? 'Listing details' : 'Inventory'}</SectionHeading>
        <VehicleDocuments vehicleId={id} vehicleStatus={vehicle.status} documentScope="inventory" />
      </div>
    ),
  }

  if (showAcquisition) {
    panels[VEHICLE_DETAIL_SECTION_IDS.acquisition] = (
      <div className="space-y-3">
        <SectionHeading>Acquisition</SectionHeading>
        <BuySheetCard
          vehicleId={id}
          initial={{
            purchase_price: vehicle.purchase_price ?? null,
            purchased_at: vehicle.purchased_at ?? null,
            purchased_from: vehicle.purchased_from ?? null,
            acquisition_source:
              (vehicle as Record<string, unknown>).acquisition_source as string | null ?? null,
            auction_name: (vehicle as Record<string, unknown>).auction_name as string | null ?? null,
            auction_lot: (vehicle as Record<string, unknown>).auction_lot as string | null ?? null,
            floor_plan_amount: (vehicle as Record<string, unknown>).floor_plan_amount as number | null ?? null,
            acquisition_notes: (vehicle as Record<string, unknown>).acquisition_notes as string | null ?? null,
          }}
        />
      </div>
    )
  }

  if (showOperations) {
    panels[VEHICLE_DETAIL_SECTION_IDS.operations] = (
      <div className="space-y-4">
        <SectionHeading>Recon & shop</SectionHeading>
        <div className="rounded-xl border overflow-hidden">
          <ReconSection
            vehicleId={id}
            canEdit={canEdit}
            canDelete={canDelete}
            canManageTemplate={isDealerAdmin(profile.role)}
          />
        </div>
        <MechanicWorksheetCard vehicleId={id} canEdit={canEdit} />
      </div>
    )
  }

  if (showSaleDetail) {
    panels[VEHICLE_DETAIL_SECTION_IDS.sale] = (
      <div className="space-y-3">
        <SectionHeading>{isRe ? 'Closing' : 'Sale'}</SectionHeading>
        <div className="border rounded-lg p-3 space-y-2 bg-card">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{isRe ? 'Closing price' : 'Sale price'}</p>
              <p className="font-semibold tabular-nums">{formatCurrency(vehicle.sold_price)}</p>
            </div>
            {!isRe && vehicle.finance_type ? (
              <div>
                <p className="text-xs text-muted-foreground">Finance type</p>
                <p className="font-semibold capitalize">
                  {vehicle.finance_type === 'bhph' ? 'BHPH' : vehicle.finance_type}
                </p>
              </div>
            ) : null}
            {!isRe && vehicle.finance_company ? (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Finance company</p>
                <p className="font-semibold">{vehicle.finance_company}</p>
              </div>
            ) : null}
            {vehicle.sold_at ? (
              <div>
                <p className="text-xs text-muted-foreground">{isRe ? 'Closing date' : 'Sold date'}</p>
                <p className="font-semibold">{formatDate(vehicle.sold_at)}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (leads && leads.length > 0) {
    panels[VEHICLE_DETAIL_SECTION_IDS.customers] = (
      <div className="space-y-3">
        <SectionHeading>{isRe ? 'Buyers' : 'Customers'} · {leads.length} linked</SectionHeading>
        <div className="space-y-2">
          {(leads as VehicleLead[]).map(lead => (
            <Link key={lead.id} href={lead.customer?.id ? `/customers/${lead.customer.id}` : '#'}>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div>
                  <p className="font-medium text-sm">{lead.customer?.name ?? 'Unknown customer'}</p>
                  <p className="text-xs text-muted-foreground">{lead.customer?.primary_phone ?? 'No phone'}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    lead.interest_level === 'hot'
                      ? 'bg-red-500/10 text-red-600'
                      : lead.interest_level === 'warm'
                        ? 'bg-yellow-500/10 text-yellow-600'
                        : 'bg-blue-500/10 text-blue-600'
                  }`}
                >
                  {lead.interest_level}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (showWebsiteOverviewPanel) {
    panels[VEHICLE_DETAIL_SECTION_IDS.website] = (
      <div className="space-y-8">
        {org ? (
          <div className="space-y-3">
            <SectionHeading>Visibility</SectionHeading>
            <VehiclePublishToggle
              vehicleId={id}
              orgSlug={org.slug}
              initialPublished={vehicle.published ?? false}
              initialSlug={vehicle.public_slug ?? null}
              dealerWebsiteLive={org.public_inventory_enabled ?? false}
            />
          </div>
        ) : null}
        <div className="space-y-3">
          <SectionHeading>Website listing</SectionHeading>
          <VehicleOverviewSection
            vehicleId={id}
            isStale={isStale}
            initialDescription={vehicle.ai_description ?? null}
            initialEnrichment={vehicle.overview_enrichment_text ?? null}
            initialAnalyzedAt={vehicle.ai_last_analyzed_at ?? null}
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              External platforms
            </span>
            <hr className="flex-1 border-border" />
          </div>
          <VehicleListingDescriptionCard vehicleId={id} />
        </div>
        <div className="space-y-3">
          <SectionHeading>Shopper documents</SectionHeading>
          <VehicleDocuments vehicleId={id} vehicleStatus={vehicle.status} documentScope="website" />
        </div>
      </div>
    )
  }

  if (activities && activities.length > 0) {
    panels[VEHICLE_DETAIL_SECTION_IDS.activity] = (
      <div className="space-y-3">
        <SectionHeading>Activity</SectionHeading>
        <ActivityTimeline activities={activities} />
      </div>
    )
  }

  if (isRe) {
    panels[VEHICLE_DETAIL_SECTION_IDS.transactions] = (
      <div className="space-y-3">
        <SectionHeading>Transaction</SectionHeading>
        <TransactionPanel
          vehicleId={id}
          isAdmin={isAdmin}
          agentId={profile.id}
          currentUserIsAuthority={currentUserIsAuthority}
          brokerName={brokerName}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={isRe
          ? ((vehicle.address_line1 as string | null) || 'Listing')
          : `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        }
        right={
          <div className="flex items-center gap-1">
            {vehicle.status === 'staging' && canDelete && !isRe && (
              <VehicleMarkReadyButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {isAdmin && vehicle.status !== 'sold' && vehicle.status !== 'staging' && !isRe && (
              <VehicleSoldButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {isAdmin && vehicle.status === 'sold' && !isRe && (
              <VehicleRestoreButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            {vehicle.published && vehicle.public_slug && org && !isRe && (
              <ShareVehicleSheet
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                publicUrl={`https://dealerwyze.com/${org.slug}/inventory/${vehicle.public_slug}`}
                vin={typeof vehicle.vin === 'string' ? vehicle.vin : null}
                vehiclePrice={vehicle.price ?? null}
                dealerSlug={org.slug}
              />
            )}
            <Link href={`/vehicles/${id}/edit`} title="Edit vehicle">
              <Button variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/vehicles" title="Back to inventory">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      />

      <VehicleDetailSectionPicker
        sections={uniqSections}
        defaultSectionId={VEHICLE_DETAIL_SECTION_IDS.listing}
        panels={panels}
      />
    </div>
  )
}
