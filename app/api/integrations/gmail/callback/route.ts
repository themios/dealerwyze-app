import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'
import { registerGmailWatch } from '@/lib/gmail/watch'

/**
 * GET /api/integrations/gmail/callback
 * Google redirects here after consent. Stores OAuth token in email_accounts.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const code   = req.nextUrl.searchParams.get('code')
  const orgId  = req.nextUrl.searchParams.get('state')

  if (!code || !orgId) {
    return NextResponse.redirect(`${appUrl}/settings/organization?email=error`)
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${appUrl}/api/integrations/gmail/callback`,
  )

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/settings/organization?email=error&reason=no_token`)
    }

    oauth2Client.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const { data: gProfile } = await gmail.users.getProfile({ userId: 'me' })
    const gmailEmail = gProfile.emailAddress ?? ''

    const supabase = createServiceClient()

    // Upsert: if this Gmail address is already connected for this org, update the token
    const { data: existing } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', gmailEmail)
      .maybeSingle()

    let accountId: string

    if (existing) {
      await supabase
        .from('email_accounts')
        .update({ oauth_refresh_token: tokens.refresh_token, enabled: true, last_error: null })
        .eq('id', existing.id)
      accountId = existing.id
    } else {
      const { data: inserted } = await supabase
        .from('email_accounts')
        .insert({
          org_id:               orgId,
          label:                `Gmail — ${gmailEmail}`,
          email:                gmailEmail,
          provider:             'gmail',
          oauth_refresh_token:  tokens.refresh_token,
        })
        .select('id')
        .single()
      accountId = inserted?.id ?? ''
    }

    // Register Gmail push watch so new messages trigger real-time delivery
    if (accountId && tokens.refresh_token) {
      await registerGmailWatch(accountId, tokens.refresh_token).catch((err) => {
        // Non-fatal — polling cron is the safety net
        console.error('Gmail watch registration failed during OAuth callback:', err?.message ?? err)
      })
    }
  } catch (e) {
    console.error('Gmail OAuth callback error:', e)
    return NextResponse.redirect(`${appUrl}/settings/organization?email=error`)
  }

  return NextResponse.redirect(`${appUrl}/settings/organization?email=connected`)
}
