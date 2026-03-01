import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import ActivityTimeline from '@/components/customer/ActivityTimeline'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import VehicleSoldButton from '@/components/vehicle/VehicleSoldButton'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const statusColors: Record<string, string> = {
  available: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  sold: 'bg-muted text-muted-foreground',
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const isAdmin = profile.role === 'admin'

  const [{ data: vehicle }, { data: activities }, { data: leads }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', id).eq('user_id', profile.org_id).single(),
    supabase.from('activities').select('*, customer:customers(id, name, primary_phone)').eq('vehicle_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('customer_vehicles').select('*, customer:customers(id, name, primary_phone)').eq('vehicle_id', id).order('created_at', { ascending: false }),
  ])

  if (!vehicle) notFound()

  return (
    <div>
      <TopBar
        title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        right={
          <div className="flex items-center gap-1">
            {isAdmin && vehicle.status !== 'sold' && (
              <VehicleSoldButton
                vehicleId={id}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              />
            )}
            <Link href={`/vehicles/${id}/edit`}>
              <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
            </Link>
            <Link href="/vehicles">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* Price + Status */}
        <div className="flex items-center justify-between">
          {vehicle.price ? (
            <p className="text-3xl font-bold">{formatCurrency(vehicle.price)}</p>
          ) : <p className="text-muted-foreground">No price set</p>}
          <span className={`text-sm font-medium px-3 py-1 rounded-full capitalize ${statusColors[vehicle.status]}`}>
            {vehicle.status}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Stock #', value: vehicle.stock_no },
            { label: 'Mileage', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : '—' },
            { label: 'Color', value: vehicle.color || '—' },
            { label: 'Trim', value: vehicle.trim || '—' },
            { label: 'VIN', value: vehicle.vin || '—' },
            { label: 'Year', value: vehicle.year.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>

        {vehicle.notes && (
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{vehicle.notes}</p>
          </div>
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
