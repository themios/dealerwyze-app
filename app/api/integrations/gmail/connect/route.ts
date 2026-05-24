import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * GET /api/integrations/gmail/connect
 * Redirects to Google OAuth consent screen.
 * State contains org_id, a CSRF token, and optional return destination.
 * The CSRF token is stored in org_settings so the callback can verify it.
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can connect Gmail' }, { status: 403 })
  }
  const from = req.nextUrl.searchParams.get('from') ?? ''

  // Generate a one-time CSRF token and store it server-side so the callback
  // can verify the state was not forged by an attacker.
  const csrf = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  const supabase = await createClient()
  await supabase
    .from('org_settings')
    .update({ gmail_oauth_csrf: csrf, gmail_oauth_csrf_expires_at: expiresAt })
    .eq('org_id', profile.org_id)

  // Read host header — this preserves subdomains (e.g. realtywyze.localhost:3000)
  // that req.nextUrl.origin strips in the Next.js dev server.
  const host = req.headers.get('host') ?? req.nextUrl.host
  const isLocalhost = host.includes('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  const appOrigin = `${protocol}://${host}`   // real origin, used for final redirect after callback
  const oauthOrigin = isLocalhost
    ? `http://localhost:${req.nextUrl.port || host.split(':')[1] || '3000'}`
    : appOrigin
  const origin = oauthOrigin                  // what Google sees as redirect_uri
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${origin}/api/integrations/gmail/callback`,
  )

  // Encode org_id, CSRF token, return destination, and both origins in state.
  // origin = OAuth redirect_uri origin (what Google was given, used to reconstruct redirect_uri in callback).
  // appOrigin = where to send the user after callback (may differ in local dev).
  const statePayload = JSON.stringify({ orgId: profile.org_id, csrf, from: from || null, origin, appOrigin })
  const state = Buffer.from(statePayload).toString('base64url')

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token even if previously granted
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state,
  })

  return NextResponse.redirect(url)
}
