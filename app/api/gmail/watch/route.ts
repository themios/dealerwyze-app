import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * Registers (or renews) Gmail push watches for all orgs with Gmail OAuth accounts.
 * Call POST /api/gmail/watch?secret=... once to register; renew every 6 days.
 * Watches expire after 7 days — add a weekly Vercel cron to auto-renew.
 */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.LEADS_POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('org_id, oauth_refresh_token, email')
    .eq('provider', 'gmail')
    .eq('enabled', true)
    .not('oauth_refresh_token', 'is', null)

  if (!accounts?.length) {
    return NextResponse.json({ error: 'No Gmail accounts found' }, { status: 404 })
  }

  const results: Record<string, unknown> = {}

  for (const account of accounts) {
    try {
      const auth = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
      )
      auth.setCredentials({ refresh_token: account.oauth_refresh_token })
      const gmail = google.gmail({ version: 'v1', auth })

      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: process.env.PUBSUB_TOPIC!,
          labelIds: ['INBOX'],
        },
      })
      results[account.email] = { ok: true, expiration: res.data.expiration }
    } catch (err) {
      results[account.email] = { ok: false, error: String(err) }
    }
  }

  return NextResponse.json({ results })
}
