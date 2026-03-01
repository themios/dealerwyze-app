import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

export async function sendLeadNotification(payload: { title: string; body: string; url: string }) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  const supabase = createServiceClient()
  const { data: rows } = await supabase.from('push_subscriptions').select('subscription')
  if (!rows?.length) return

  await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, JSON.stringify(payload)))
  )
}
