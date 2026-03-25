export const dynamic = 'force-dynamic'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil, Flame } from 'lucide-react'
import { isDealerAdmin } from '@/types/index'
import CustomerDetailClient from './CustomerDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const [{ data: customer }, { data: sentActivities }, { data: scheduledActivities }, { data: tasks }, { data: cvData }] = await Promise.all([
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
  ])

  // Pick the primary vehicle: prefer non-sold/non-removed, fall back to first
  const primaryVehicle = (() => {
    if (!cvData || cvData.length === 0) return null
    const rows = cvData as unknown as { vehicle: Record<string, unknown> | null }[]
    const active = rows.find(r => r.vehicle && r.vehicle.status !== 'sold' && r.vehicle.status !== 'sync_removed')
    return ((active || rows[0])?.vehicle ?? null)
  })()

  if (!customer) notFound()

  return (
    <div>
      <TopBar
        left={
          <h1 className="text-lg font-semibold flex items-center gap-1.5">
            {(customer as { lead_rating?: string | null }).lead_rating === 'hot' && (
              <Flame className="h-4 w-4 text-orange-400 flex-shrink-0" />
            )}
            {customer.name}
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
      <CustomerDetailClient customer={customer} activities={sentActivities || []} scheduledActivities={scheduledActivities || []} isAdmin={isDealerAdmin(profile.role)} currentUserId={profile.id} tasks={tasks || []} initialVehicle={primaryVehicle} />
    </div>
  )
}
