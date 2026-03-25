/**
 * Gmail Pub/Sub Watch Management
 *
 * Registers and renews Gmail push notification watches so Google delivers
 * new-message events to /api/integrations/gmail/push within seconds instead
 * of waiting for the 15-minute polling cron.
 *
 * Each watch is valid for ~7 days. renewExpiredWatches() is called from the
 * check-tasks cron daily to keep them fresh.
 */

import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'

function buildOAuthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

/**
 * Register a Gmail push watch for one email account.
 * Stores the expiration timestamp and starting historyId in email_accounts.
 */
export async function registerGmailWatch(
  accountId: string,
  refreshToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const topic = process.env.GMAIL_PUBSUB_TOPIC
  if (!topic) {
    console.error('[gmail/watch] GMAIL_PUBSUB_TOPIC env var not set')
    return { ok: false, error: 'GMAIL_PUBSUB_TOPIC not configured' }
  }

  const supabase = createServiceClient()

  try {
    const auth = buildOAuthClient(refreshToken)
    const gmail = google.gmail({ version: 'v1', auth })

    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: topic,
        labelIds: ['INBOX'],
      },
    })

    const expiration = res.data.expiration
      ? new Date(Number(res.data.expiration)).toISOString()
      : null
    const historyId = res.data.historyId ? String(res.data.historyId) : null

    await supabase
      .from('email_accounts')
      .update({
        gmail_watch_expiration: expiration,
        gmail_history_id: historyId,
        last_error: null,
      })
      .eq('id', accountId)

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gmail/watch] registerGmailWatch failed for account', accountId, message)

    await supabase
      .from('email_accounts')
      .update({ last_error: `watch_failed: ${message.slice(0, 200)}` })
      .eq('id', accountId)

    return { ok: false, error: message }
  }
}

/**
 * Renew all Gmail watches that expire within the next 25 hours.
 * Called daily from the check-tasks cron (Job 14).
 */
export async function renewExpiredWatches(): Promise<{ renewed: number; failed: number }> {
  const supabase = createServiceClient()

  const cutoff = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()

  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select('id, oauth_refresh_token')
    .lt('gmail_watch_expiration', cutoff)
    .not('oauth_refresh_token', 'is', null)
    .eq('enabled', true)

  if (error) {
    console.error('[gmail/watch] renewExpiredWatches query error:', error.message)
    return { renewed: 0, failed: 0 }
  }

  let renewed = 0
  let failed = 0

  for (const account of accounts ?? []) {
    if (!account.oauth_refresh_token) continue
    const result = await registerGmailWatch(account.id, account.oauth_refresh_token)
    if (result.ok) {
      renewed++
    } else {
      failed++
    }
  }

  return { renewed, failed }
}
