import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const maxDuration = 55

/**
 * Data retention policy:
 * - Cancelled orgs 0–90 days: data retained, messaging blocked
 * - Cancelled orgs > 90 days: hard delete threads/messages/activities/receipts
 *   Keep: anonymized billing history (organizations row itself)
 *
 * Schedule: daily via vercel.json cron
 */
export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Find orgs cancelled more than 90 days ago
  const { data: expiredOrgs } = await supabase
    .from('organizations')
    .select('id')
    .eq('subscription_status', 'canceled')
    .not('canceled_at', 'is', null)
    .lt('canceled_at', ninetyDaysAgo)

  let orgsProcessed = 0
  let activitiesDeleted = 0
  let receiptsDeleted = 0
  let customersDeleted = 0
  let tasksDeleted = 0

  for (const org of expiredOrgs ?? []) {
    const orgId = org.id

    // Delete activities
    const { count: actCount } = await supabase
      .from('activities')
      .delete({ count: 'exact' })
      .eq('user_id', orgId)
    activitiesDeleted += actCount ?? 0

    // Delete receipts + ledger transactions (cascade via FK or delete explicitly)
    const { count: receiptCount } = await supabase
      .from('receipts')
      .delete({ count: 'exact' })
      .eq('user_id', orgId)
    receiptsDeleted += receiptCount ?? 0

    await supabase.from('ledger_transactions').delete().eq('user_id', orgId)

    // Delete tasks
    const { count: taskCount } = await supabase
      .from('tasks')
      .delete({ count: 'exact' })
      .eq('user_id', orgId)
    tasksDeleted += taskCount ?? 0

    // Delete customers (cascades to customer_vehicles, customer_documents via FK)
    const { count: custCount } = await supabase
      .from('customers')
      .delete({ count: 'exact' })
      .eq('user_id', orgId)
    customersDeleted += custCount ?? 0

    // Delete vehicles
    await supabase.from('vehicles').delete().eq('user_id', orgId)

    // Delete briefings
    await supabase.from('briefings').delete().eq('org_id', orgId)

    // Anonymize org settings (keep row for billing audit trail)
    await supabase.from('org_settings').update({
      gmail_refresh_token: null,
      gmail_access_token: null,
      business_phone: null,
      twilio_phone_number: null,
      twilio_phone_sid: null,
    }).eq('org_id', orgId)

    orgsProcessed++
  }

  return NextResponse.json({
    orgs_processed: orgsProcessed,
    activities_deleted: activitiesDeleted,
    receipts_deleted: receiptsDeleted,
    tasks_deleted: tasksDeleted,
    customers_deleted: customersDeleted,
  })
}
