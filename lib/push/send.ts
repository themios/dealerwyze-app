import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

function vapidReady(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

/**
 * Send a push notification to all subscribed browsers for a dealer org.
 * Uses the shared push_subscriptions table (org_id scoped).
 * Service client is legitimate here: called from admin API routes and webhooks.
 */
export async function sendPushToOrg(
  orgId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  if (!orgId) {
    console.error('[push/send] sendPushToOrg called without orgId — aborting to prevent cross-org leak')
    return
  }
  if (!vapidReady()) return

  initVapid()
  const supabase = createServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('org_id', orgId)

  if (!subs?.length) return

  await Promise.allSettled(
    subs.map(row =>
      webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify(payload))
        .catch(async (err: { statusCode?: number }) => {
          // 410 Gone means the subscription has expired — clean it up
          if (err?.statusCode === 410) {
            await supabase.from('push_subscriptions')
              .delete().eq('subscription->>endpoint', (row.subscription as { endpoint: string }).endpoint)
          }
        })
    )
  )
}

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
  if (!vapidReady()) {
    console.warn('[push/send] VAPID keys not configured — skipping push notification')
    return
  }

  initVapid()
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('org_id', orgId)

  if (!rows?.length) return

  await Promise.allSettled(
    rows.map(row => webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify(payload)))
  )
}
