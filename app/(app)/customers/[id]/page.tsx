export const dynamic = 'force-dynamic'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil, Flame } from 'lucide-react'
import { isDealerAdmin, type LeadIntentTier } from '@/types/index'
import CustomerDetailClient from './CustomerDetailClient'
import { LEAD_INTENT_TIER_LABELS, LEAD_INTENT_TIER_STYLES } from '@/lib/leads/intent'
import { isMultiLocationFromCount } from '@/lib/locations/uiRules'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const [{ data: customer }, { data: sentActivities }, { data: scheduledActivities }, { data: tasks }, { data: cvData }, { data: activeLocations }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).eq('user_id', profile.org_id).single(),
    // Actual sent/received communication — excludes pending sequence steps
    supabase.from('activities')
      .select('*, vehicle:vehicles(id, year, make, model)')
      .eq('customer_id', id)
      .or('completed_at.not.is.null,customer_sequence_id.is.null')
      .order('created_at', { ascending: false })
      .limit(100),
    // Pending scheduled sequence steps — not yet sent
    supabase.from('activities')
      .select('*')
      .eq('customer_id', id)
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .order('due_at', { ascending: true })
      .limit(30),
    supabase.from('tasks')
      .select('id, title, task_type, priority, due_at, status, notes')
      .eq('linked_customer_id', id)
      .eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    supabase.from('customer_vehicles').select('vehicle:vehicles(*)').eq('customer_id', id),
    supabase
      .from('dealer_locations')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])
  const locations = activeLocations ?? []
  const isMultiLocation = isMultiLocationFromCount(locations.length)

  // Org owner's display name: available directly when the viewer IS the owner.
  // For team-admin views (id !== org_id) we skip it — dropdown still works, just shows 'Unassigned'.
  const orgOwnerName = profile.id === profile.org_id ? (profile.display_name ?? null) : null

  // Pick the primary vehicle: prefer non-sold/non-removed, fall back to first
  const primaryVehicle = (() => {
    if (!cvData || cvData.length === 0) return null
    const rows = cvData as unknown as { vehicle: Record<string, unknown> | null }[]
    const active = rows.find(r => r.vehicle && r.vehicle.status !== 'sold' && r.vehicle.status !== 'sync_removed')
    return ((active || rows[0])?.vehicle ?? null)
  })()

  if (!customer) notFound()
  const intentTier: LeadIntentTier = customer.lead_intent_tier === 'hot' || customer.lead_intent_tier === 'warm' || customer.lead_intent_tier === 'active' || customer.lead_intent_tier === 'standard'
    ? customer.lead_intent_tier
    : (customer as { lead_rating?: string | null }).lead_rating === 'hot'
      ? 'hot'
      : 'standard'
  const intentStyle = LEAD_INTENT_TIER_STYLES[intentTier]

  return (
    <div>
      <TopBar
        left={
          <h1 className="flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, lineHeight: 1.15 }}>
            {customer.name}
            {intentTier !== 'standard' && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${intentStyle.badge}`}>
                <Flame className="h-3 w-3 flex-shrink-0" />{LEAD_INTENT_TIER_LABELS[intentTier]}
              </span>
            )}
          </h1>
        }
        right={
          <div className="flex items-center gap-1">
            <Link href={`/customers/${id}/edit`} title="Edit lead">
              <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
            </Link>
            <Link href="/customers" title="Back to leads">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />
      <CustomerDetailClient customer={customer} activities={sentActivities || []} scheduledActivities={scheduledActivities || []} isAdmin={isDealerAdmin(profile.role)} currentUserId={profile.id} tasks={tasks || []} initialVehicle={primaryVehicle} orgOwnerName={orgOwnerName} isMultiLocation={isMultiLocation} locations={isMultiLocation ? locations : []} />
    </div>
  )
}
