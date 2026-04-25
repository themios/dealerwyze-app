import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

// Per-org OAuth callback — verifies CSRF state token, then stores refresh token in org_google_tokens.
export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const rawState = req.nextUrl.searchParams.get('state') ?? ''

  const redirectBase = `${process.env.NEXT_PUBLIC_APP_URL}/settings/organization`

  if (!code || !rawState) {
    return NextResponse.redirect(`${redirectBase}?calendar=error`)
  }

  // Parse state and verify CSRF token
  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString()) as {
      userId: string
      csrf: string
    }
    userId = parsed.userId

    if (!userId || !parsed.csrf) {
      return NextResponse.redirect(`${redirectBase}?calendar=error&reason=invalid_state`)
    }

    const service = createServiceClient()

    // Look up the org via the user profile
    const { data: profile } = await service
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single()

    if (!profile?.org_id) {
      return NextResponse.redirect(`${redirectBase}?calendar=error&reason=invalid_state`)
    }

    const orgId = profile.org_id

    // Verify CSRF token against the one stored in org_google_tokens
    const { data: tokenRow } = await service
      .from('org_google_tokens')
      .select('calendar_oauth_csrf, calendar_oauth_csrf_expires_at')
      .eq('org_id', orgId)
      .maybeSingle()

    const storedCsrf   = tokenRow?.calendar_oauth_csrf ?? ''
    const expiresAt    = tokenRow?.calendar_oauth_csrf_expires_at
    const isExpired    = !expiresAt || new Date(expiresAt) < new Date()
    const csrfExpected = Buffer.from(storedCsrf)
    const csrfProvided = Buffer.from(parsed.csrf)

    const csrfValid =
      !isExpired &&
      csrfExpected.length > 0 &&
      csrfExpected.length === csrfProvided.length &&
      crypto.timingSafeEqual(csrfExpected, csrfProvided)

    if (!csrfValid) {
      console.warn('[calendar-callback] CSRF verification failed for org:', orgId)
      return NextResponse.redirect(`${redirectBase}?calendar=error&reason=invalid_state`)
    }

    const oauth2 = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/calendar-callback`,
    )

    const { tokens } = await oauth2.getToken(code)

    if (tokens.refresh_token) {
      // Store token and clear the one-time CSRF token
      await service
        .from('org_google_tokens')
        .upsert({
          org_id: orgId,
          calendar_refresh_token: tokens.refresh_token,
          token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
          calendar_oauth_csrf: null,
          calendar_oauth_csrf_expires_at: null,
        }, { onConflict: 'org_id' })
    }

    return NextResponse.redirect(`${redirectBase}?calendar=connected`)
  } catch (err) {
    console.error('[calendar-callback]', err)
    return NextResponse.redirect(`${redirectBase}?calendar=error`)
  }
}
