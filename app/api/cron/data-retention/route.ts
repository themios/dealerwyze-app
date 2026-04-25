import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
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
  const denied = validateCronAuth(req)
  if (denied) return denied

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

  // --- Storage pack expiry cleanup ---
  // Orgs whose storage grace period has ended: delete files beyond 500 MB base quota,
  // then reset their quota back to base.
  const BASE_BYTES = 500 * 1024 * 1024
  const now = new Date().toISOString()

  const { data: expiredPacks } = await supabase
    .from('org_settings')
    .select('org_id')
    .not('storage_pack_expires_at', 'is', null)
    .lt('storage_pack_expires_at', now)

  let storageOrgsProcessed = 0
  let storageFilesDeleted = 0

  for (const row of expiredPacks ?? []) {
    const orgId = row.org_id

    // Fetch all docs for this org, largest first
    const [{ data: vDocs }, { data: cDocs }] = await Promise.all([
      supabase.from('vehicle_documents')
        .select('id, vehicle_id, file_key, file_size')
        .eq('user_id', orgId)
        .order('file_size', { ascending: false }),
      supabase.from('customer_documents')
        .select('id, customer_id, file_key, file_size')
        .eq('user_id', orgId)
        .order('file_size', { ascending: false }),
    ])

    const allDocs = [
      ...(vDocs ?? []).map(d => ({ ...d, bucket: 'vehicle-docs', table: 'vehicle_documents' as const })),
      ...(cDocs ?? []).map(d => ({ ...d, bucket: 'customer-docs', table: 'customer_documents' as const })),
    ].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))

    const totalBytes = allDocs.reduce((s, d) => s + (d.file_size ?? 0), 0)
    if (totalBytes <= BASE_BYTES) {
      // Already within base quota — just reset the expiry columns
      await supabase.from('org_settings').update({
        storage_pack: 'none',
        storage_quota_bytes: BASE_BYTES,
        storage_pack_expires_at: null,
      }).eq('org_id', orgId)
      storageOrgsProcessed++
      continue
    }

    // Delete largest files until we're at or below base quota
    let runningTotal = totalBytes
    for (const doc of allDocs) {
      if (runningTotal <= BASE_BYTES) break
      const { error: rmErr } = await supabase.storage
        .from(doc.bucket)
        .remove([doc.file_key])
      if (!rmErr) {
        await supabase.from(doc.table).delete().eq('id', doc.id)
        runningTotal -= doc.file_size ?? 0
        storageFilesDeleted++
      }
    }

    // Reset quota columns
    await supabase.from('org_settings').update({
      storage_pack: 'none',
      storage_quota_bytes: BASE_BYTES,
      storage_pack_expires_at: null,
    }).eq('org_id', orgId)

    storageOrgsProcessed++
  }

  return NextResponse.json({
    orgs_processed: orgsProcessed,
    activities_deleted: activitiesDeleted,
    receipts_deleted: receiptsDeleted,
    tasks_deleted: tasksDeleted,
    customers_deleted: customersDeleted,
    storage_packs_expired: storageOrgsProcessed,
    storage_files_deleted: storageFilesDeleted,
  })
}
