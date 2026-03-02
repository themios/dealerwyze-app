import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import { Search, Receipt, CalendarDays } from 'lucide-react'
import TopBar from '@/components/layout/TopBar'
import TodayContent from './TodayContent'
import SyncGmailButton from '@/components/leads/SyncGmailButton'
import DealerBrief from '@/components/today/DealerBrief'
import TodoSection from '@/components/today/TodoSection'
import OnboardingChecklist from '@/components/today/OnboardingChecklist'
import ResponseTimeWidget from '@/components/today/ResponseTimeWidget'
import ReviewsSection from '@/components/today/ReviewsSection'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  const now = new Date().toISOString()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: newLeads } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, email)')
    .eq('user_id', orgId)
    .eq('type', 'email')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)
    .order('created_at', { ascending: false })

  const { data: tasks } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone, email)')
    .eq('user_id', orgId)
    .in('type', ['task', 'appointment', 'call', 'sms', 'email'])
    .is('completed_at', null)
    .not('direction', 'eq', 'inbound')
    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .lte('due_at', todayEnd.toISOString())
    .not('due_at', 'is', null)
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true })

  const { data: waitingRaw } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone)')
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

  const seenCustomers = new Set<string>()
  const waiting = (waitingRaw || []).filter(a => {
    if (!a.customer_id || seenCustomers.has(a.customer_id)) return false
    seenCustomers.add(a.customer_id)
    return true
  })

  const { data: leadTemplates } = await supabase
    .from('templates')
    .select('*')
    .eq('user_id', orgId)
    .eq('category', 'lead_response')
    .order('created_at', { ascending: true })

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
    supabase.from('org_settings').select('onboarding_completed_at').eq('org_id', orgId).maybeSingle(),
    supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).maybeSingle(),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', orgId),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('email_accounts').select('id').eq('org_id', orgId).limit(1),
  ])

  // Appointment requests: inbound appointment activities not yet confirmed (direction=inbound)
  const { data: apptRequests } = await supabase
    .from('activities')
    .select('*, customer:customers(id, name, primary_phone)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .eq('direction', 'inbound')
    .eq('outcome', 'pending')
    .is('completed_at', null)
    .order('created_at', { ascending: false })

  return (
    <div>
      <TopBar
        left={<SyncGmailButton compact />}
        right={
          <>
            <Link href="/search" className="p-1.5 text-white/70 hover:text-white" aria-label="Search"><Search className="h-5 w-5" /></Link>
            <Link href="/calendar" className="p-1.5 text-white/70 hover:text-white" aria-label="Calendar"><CalendarDays className="h-5 w-5" /></Link>
            <Link href="/receipts" className="p-1.5 text-white/70 hover:text-white" aria-label="Receipts"><Receipt className="h-5 w-5" /></Link>
          </>
        }
      />
      <DealerBrief />
      <ResponseTimeWidget orgId={orgId} />
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
      <TodayContent
        initialNewLeads={newLeads || []}
        initialTasks={tasks || []}
        initialWaiting={waiting}
        leadTemplates={leadTemplates || []}
        initialApptRequests={apptRequests || []}
        initialVoiceLeads={voiceLeadsRaw || []}
      />
      <TodoSection initialTasks={todos ?? []} />
    </div>
  )
}
