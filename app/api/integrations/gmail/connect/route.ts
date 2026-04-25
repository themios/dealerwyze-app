import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireProfile } from '@/lib/auth/profile'
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

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`,
  )

  // Encode org_id, CSRF token, and return destination in state.
  // Format: base64url(JSON) — self-contained but verified server-side on callback.
  const statePayload = JSON.stringify({ orgId: profile.org_id, csrf, from: from || null })
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
