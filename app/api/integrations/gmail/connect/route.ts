import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireProfile } from '@/lib/auth/profile'

/**
 * GET /api/integrations/gmail/connect
 * Redirects to Google OAuth consent screen.
 * org_id is passed as `state` so the callback knows which org to update.
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const from = req.nextUrl.searchParams.get('from') ?? ''

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`,
  )

  // Encode org_id and return destination in state so callback can redirect correctly.
  // Format: "<org_id>|<from>" — pipe is safe; org_id is a UUID (no pipes).
  const state = from ? `${profile.org_id}|${from}` : profile.org_id

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
