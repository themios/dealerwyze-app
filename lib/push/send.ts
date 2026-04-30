import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Send a push notification to all subscribed browsers for a specific org.
 * The orgId parameter is REQUIRED — calling without it would broadcast to all dealers (privacy bug).
 * Service client is legitimate here: called from inbound webhooks with no user session.
 */
export async function sendLeadNotification(
  payload: { title: string; body: string; url: string },
  orgId: string,
) {
  if (!orgId) {
    console.error('[push/send] sendLeadNotification called without orgId — aborting to prevent cross-org leak')
    return
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    console.warn('[push/send] VAPID keys not configured — skipping push notification')
    return
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('org_id', orgId)

  if (!rows?.length) return

  await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, JSON.stringify(payload)))
  )
}
