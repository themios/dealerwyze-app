import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'
import { registerGmailWatch } from '@/lib/gmail/watch'
import crypto from 'crypto'

/**
 * GET /api/integrations/gmail/callback
 * Google redirects here after consent. Verifies CSRF state token, then stores
 * OAuth token in email_accounts.
 */
export async function GET(req: NextRequest) {
  const code      = req.nextUrl.searchParams.get('code')
  const rawState  = req.nextUrl.searchParams.get('state') ?? ''

  // Fallback to NEXT_PUBLIC_APP_URL if state can't be parsed
  const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL!

  // Default error destination — will be overridden once state is parsed
  let errorUrl   = `${fallbackUrl}/settings/organization?email=error`
  let successUrl = `${fallbackUrl}/settings/organization?email=connected`
  let appUrl     = fallbackUrl

  if (!code || !rawState) {
    return NextResponse.redirect(errorUrl)
  }

  // Parse and verify CSRF state
  let orgId = ''

  try {
    const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString()) as {
      orgId: string
      csrf: string
      from: string | null
      origin?: string    // OAuth redirect_uri origin (used to reconstruct redirect_uri for token exchange)
      appOrigin?: string // actual app origin to redirect user back to after callback
    }
    orgId = parsed.orgId
    const from = parsed.from ?? null

    // appOrigin is where the user actually is — use this for final redirect URLs.
    // Fall back to origin, then NEXT_PUBLIC_APP_URL.
    const userOrigin = parsed.appOrigin ?? parsed.origin ?? fallbackUrl
    if (parsed.origin) appUrl = parsed.origin  // appUrl used only for OAuth client redirect_uri

    if (!orgId || !parsed.csrf) {
      return NextResponse.redirect(errorUrl)
    }

    // Update redirect URLs using the real app origin
    errorUrl   = `${userOrigin}/settings/organization?email=error`
    successUrl = `${userOrigin}/settings/organization?email=connected`
    if (from === 'onboarding') {
      successUrl = `${userOrigin}/onboarding?gmail_connected=1`
      errorUrl   = `${userOrigin}/onboarding?gmail_error=1`
    }

    // Verify the CSRF token against the one stored server-side
    const supabase = createServiceClient()
    const { data: settings } = await supabase
      .from('org_settings')
      .select('gmail_oauth_csrf, gmail_oauth_csrf_expires_at')
      .eq('org_id', orgId)
      .maybeSingle()

    const storedCsrf    = settings?.gmail_oauth_csrf ?? ''
    const expiresAt     = settings?.gmail_oauth_csrf_expires_at
    const isExpired     = !expiresAt || new Date(expiresAt) < new Date()
    const csrfExpected  = Buffer.from(storedCsrf)
    const csrfProvided  = Buffer.from(parsed.csrf)

    const csrfValid =
      !isExpired &&
      csrfExpected.length > 0 &&
      csrfExpected.length === csrfProvided.length &&
      crypto.timingSafeEqual(csrfExpected, csrfProvided)

    if (!csrfValid) {
      console.warn('[gmail/callback] CSRF verification failed for org:', orgId)
      return NextResponse.redirect(`${errorUrl}&reason=invalid_state`)
    }

    // Clear the one-time CSRF token so it cannot be replayed
    await supabase
      .from('org_settings')
      .update({ gmail_oauth_csrf: null, gmail_oauth_csrf_expires_at: null })
      .eq('org_id', orgId)
  } catch {
    return NextResponse.redirect(`${errorUrl}&reason=invalid_state`)
  }

  // redirect_uri must match exactly what was sent in the connect route
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${appUrl}/api/integrations/gmail/callback`,
  )

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${errorUrl}&reason=no_token`)
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
    return NextResponse.redirect(errorUrl)
  }

  return NextResponse.redirect(successUrl)
}
