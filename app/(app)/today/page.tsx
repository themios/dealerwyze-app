export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { shouldShowAddressedActivity } from '@/lib/utils'
import Link from 'next/link'
import { Receipt, CalendarDays } from 'lucide-react'
import TopBar from '@/components/layout/TopBar'
import TodayContent from './TodayContent'
import SyncGmailButton from '@/components/leads/SyncGmailButton'
import TodoSection from '@/components/today/TodoSection'
import DealerBriefClient from '@/components/today/DealerBriefClient'
import OnboardingChecklist from '@/components/today/OnboardingChecklist'
import ReviewsSection from '@/components/today/ReviewsSection'

export default async function TodayPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const orgId = profile.org_id

  const now = new Date().toISOString()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: newLeads } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, email, sms_opt_out, unsubscribe_email, unsubscribe_sms, archived)')
    .eq('user_id', orgId)
    .eq('type', 'email')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order('created_at', { ascending: false })

  // Filter out activities whose customer join returned null (orphaned activities)
  // Hide addressed cards until next day or follow-up due date
  const todayRef = new Date()
  const safeNewLeads = (newLeads || []).filter(
    a => a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
  )

  const { data: tasksRaw } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, email, archived)')
    .eq('user_id', orgId)
    .in('type', ['task', 'appointment', 'call', 'sms', 'email', 'email_followup', 'sms_followup'])
    .is('completed_at', null)
    .not('direction', 'eq', 'inbound')
    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .lte('due_at', todayEnd.toISOString())
    .not('due_at', 'is', null)
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true })

  const tasks = (tasksRaw || []).filter(a => {
    const c = (a as { customer?: { archived?: boolean | null } | null }).customer
    if (c?.archived) return false
    return shouldShowAddressedActivity(a, todayRef)
  })

  const { data: waitingRaw } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, archived)')
    .eq('user_id', orgId)
    .eq('direction', 'outbound')
    .in('type', ['call', 'sms', 'email'])
    .not('outcome', 'eq', 'pending')
    .lt('created_at', yesterday)
    .is('completed_at', null)
    .order('created_at', { ascending: false })

  const todosNow = new Date().toISOString()
  const { data: todos } = await supabase
    .from('tasks')
    .select(`
      *,
      vehicles:linked_vehicle_id(stock_no, year, make, model),
      receipts:linked_receipt_id(vendor_norm, vendor_raw, total),
      customers:linked_customer_id(name, primary_phone)
    `)
    .eq('user_id', orgId)
    .eq('status', 'open')
    .or(`snooze_until.is.null,snooze_until.lt.${todosNow}`)
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(50)

  // Customers who replied (inbound SMS or email) in the last 48h — used for green card indicator
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: inboundReplies } = await supabase
    .from('activities')
    .select('customer_id')
    .eq('user_id', orgId)
    .eq('direction', 'inbound')
    .in('type', ['sms', 'email'])
    .gte('created_at', fortyEightHoursAgo)
    .not('customer_id', 'is', null)
    .limit(200)
  const respondedCustomerIds = [...new Set((inboundReplies || []).map(a => a.customer_id as string))]

  const seenCustomers = new Set<string>()
  const waiting = (waitingRaw || []).filter(a => {
    if (!a.customer_id || seenCustomers.has(a.customer_id)) return false
    const c = (a as { customer?: { archived?: boolean | null } | null }).customer
    if (c?.archived) return false
    if (!shouldShowAddressedActivity(a, todayRef)) return false
    seenCustomers.add(a.customer_id)
    return true
  })

  const { data: leadTemplates } = await supabase
    .from('templates')
    .select('*')
    .eq('user_id', orgId)
    .eq('category', 'lead_response')
    .order('created_at', { ascending: true })

  // Active/paused customer sequence enrollments for this org
  const { data: seqEnrollments } = await supabase
    .from('customer_sequences')
    .select('id, customer_id, status, sequence_id, sequences!inner(name, channel)')
    .eq('org_id', orgId)
    .in('status', ['active', 'paused'])

  // Build sequenceStatusMap: customer_id -> sequence status info
  type SeqStatusEntry = {
    id: string
    status: 'active' | 'paused' | 'completed' | 'cancelled'
    sequence_name: string
    next_step_due?: string | null
    step_number?: number | null
    step_total?: number | null
  }
  const sequenceStatusMap: Record<string, SeqStatusEntry> = {}
  for (const enr of seqEnrollments ?? []) {
    const seq = Array.isArray(enr.sequences) ? enr.sequences[0] : enr.sequences
    sequenceStatusMap[enr.customer_id] = {
      id: enr.id,
      status: enr.status as 'active' | 'paused',
      sequence_name: (seq as any)?.name ?? '',
    }
  }

  // For each enrolled customer, find the next pending step due_at
  if (Object.keys(sequenceStatusMap).length > 0) {
    const customerIds = Object.keys(sequenceStatusMap)
    const { data: pendingSteps } = await supabase
      .from('activities')
      .select('customer_id, due_at, customer_sequence_id')
      .in('customer_id', customerIds)
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
      .order('due_at', { ascending: true })

    for (const step of pendingSteps ?? []) {
      const entry = sequenceStatusMap[step.customer_id]
      if (entry && !entry.next_step_due) {
        entry.next_step_due = step.due_at
      }
    }
  }

  // GBP reviews: last 30 days, most recent first
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: gbpReviews, error: gbpReviewsError } = await supabase
    .from('gbp_reviews')
    .select('id, author_name, rating, comment, create_time, reply_comment')
    .eq('org_id', orgId)
    .gte('create_time', thirtyDaysAgo)
    .order('create_time', { ascending: false })
    .limit(10)
  if (gbpReviewsError) console.error('[today] gbp_reviews fetch error:', gbpReviewsError)

  // Voice leads: completed calls from today with pending tasks
  const { data: voiceLeadsRaw } = await supabase
    .from('voice_calls')
    .select('*, customer:customers(id, name, primary_phone)')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })

  // Onboarding checklist data (lightweight — head:true counts only)
  const [
    { data: orgSettings },
    { data: orgBilling },
    { count: customerCount },
    { count: teamCount },
    { data: emailAccounts },
  ] = await Promise.all([
    supabase.from('org_settings').select('onboarding_completed_at, business_name').eq('org_id', orgId).maybeSingle(),
    supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).maybeSingle(),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', orgId),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('email_accounts').select('id').eq('org_id', orgId).limit(1),
  ])

  // Vehicle want-list matches — inbound, pending, not yet addressed
  const { data: vehicleMatchesRaw } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, archived), vehicle:vehicles(id, year, make, model)')
    .eq('user_id', orgId)
    .eq('type', 'vehicle_match')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order('created_at', { ascending: false })
  const vehicleMatches = (vehicleMatchesRaw || []).filter(
    a => a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
  )

  // Appointment requests: inbound appointment activities not yet confirmed (direction=inbound)
  const { data: apptRequests } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, archived)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)

    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order('created_at', { ascending: false })

  // Filter out activities whose customer join returned null (orphaned activities)
  // Hide addressed until next day or follow-up
  const safeApptRequests = (apptRequests || []).filter(
    a => a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
  )

  const newLeadCount    = safeNewLeads.length
  const apptCount       = safeApptRequests.length
  const voiceCount      = (voiceLeadsRaw ?? []).length
  const waitingCount    = waiting.length
  const overdueCount    = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date()).length

  return (
    <div>
      <TopBar
        left={<SyncGmailButton compact />}
        right={
          <>
            <Link href="/calendar" className="p-1.5 text-white/70 hover:text-white" aria-label="Calendar" title="Calendar"><CalendarDays className="h-5 w-5" /></Link>
            <Link href="/receipts" className="p-1.5 text-white/70 hover:text-white" aria-label="Receipts" title="Scan receipts"><Receipt className="h-5 w-5" /></Link>
          </>
        }
      />

      {/* Desktop KPI strip — hidden on mobile */}
      <div className="hidden lg:grid lg:grid-cols-5 gap-3 px-6 py-4 border-b border-border bg-card/50">
        {[
          { label: 'New Leads',       value: newLeadCount,  color: newLeadCount > 0  ? 'text-blue-500'   : 'text-muted-foreground' },
          { label: 'Appt Requests',   value: apptCount,     color: apptCount > 0     ? 'text-orange-500' : 'text-muted-foreground' },
          { label: 'Voice Leads',     value: voiceCount,    color: voiceCount > 0    ? 'text-purple-500' : 'text-muted-foreground' },
          { label: 'Waiting',         value: waitingCount,  color: waitingCount > 0  ? 'text-yellow-500' : 'text-muted-foreground' },
          { label: 'Overdue',         value: overdueCount,  color: overdueCount > 0  ? 'text-red-500'    : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-2">
            <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Desktop 3-column grid — mobile: single column (stacked, unchanged) */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-0 lg:items-start lg:h-[calc(100dvh-7rem)]">

        {/* Left column: Intelligence — DealerBrief, ResponseTime, Reviews */}
        <div className="lg:border-r lg:border-border lg:overflow-y-auto lg:h-full">
          <DealerBriefClient />
          {(gbpReviews?.length ?? 0) > 0 && (
            <ReviewsSection initialReviews={gbpReviews!} />
          )}
          <OnboardingChecklist
            orgId={orgId}
            onboardingCompletedAt={orgSettings?.onboarding_completed_at ?? null}
            checkItems={{
              hasCustomer:    (customerCount ?? 0) > 0,
              hasEmail:       (emailAccounts?.length ?? 0) > 0,
              hasSmsTemplate: (leadTemplates?.length ?? 0) > 0,
              hasTeamMember:  (teamCount ?? 0) > 1,
              hasPlan:        !!(orgBilling?.stripe_customer_id),
            }}
          />
        </div>

        {/* Center column: Lead activity feed */}
        <div className="lg:border-r lg:border-border lg:overflow-y-auto lg:h-full">
          <TodayContent
            initialNewLeads={safeNewLeads}
            initialTasks={tasks || []}
            initialWaiting={waiting}
            initialApptRequests={safeApptRequests}
            initialVoiceLeads={voiceLeadsRaw || []}
            initialVehicleMatches={vehicleMatches}
            businessName={orgSettings?.business_name ?? undefined}
            respondedCustomerIds={respondedCustomerIds}
            sequenceStatusMap={sequenceStatusMap}
          />
        </div>

        {/* Right column: Tasks & To-Dos */}
        <div className="lg:overflow-y-auto lg:h-full">
          <TodoSection initialTasks={todos ?? []} />
        </div>

      </div>
    </div>
  )
}
