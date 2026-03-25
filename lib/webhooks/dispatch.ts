import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Dispatch a webhook event to all active org webhooks subscribed to this event.
 * Always fire-and-forget — never await in hot path.
 * Usage: dispatchWebhook(orgId, 'new_lead', { ... }).catch(() => {})
 */
export async function dispatchWebhook(
  orgId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient()

  const { data: hooks } = await supabase
    .from('org_webhooks')
    .select('id, url, events, secret')
    .eq('org_id', orgId)
    .eq('active', true)

  if (!hooks || hooks.length === 0) return

  const subscribed = hooks.filter(
    (h: { events: string[] }) => h.events.includes('*') || h.events.includes(event),
  )

  if (subscribed.length === 0) return

  const timestamp = new Date().toISOString()
  const bodyStr = JSON.stringify({ event, timestamp, data: payload })

  await Promise.allSettled(
    subscribed.map(async (hook: { id: string; url: string; secret: string }) => {
      const sig = 'sha256=' + crypto
        .createHmac('sha256', hook.secret)
        .update(bodyStr)
        .digest('hex')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)

      try {
        await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DealerWyze-Signature': sig,
          },
          body: bodyStr,
          signal: controller.signal,
        })
      } catch {
        // Fire-and-forget: all errors silently swallowed
      } finally {
        clearTimeout(timer)
      }
    }),
  )
}
