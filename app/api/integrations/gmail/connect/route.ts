import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireProfile } from '@/lib/auth/profile'

/**
 * GET /api/integrations/gmail/connect
 * Redirects to Google OAuth consent screen.
 * org_id is passed as `state` so the callback knows which org to update.
 */
export async function GET() {
  const profile = await requireProfile()

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`,
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token even if previously granted
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state: profile.org_id,
  })

  return NextResponse.redirect(url)
}
