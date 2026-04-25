import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

export async function GET() {
  const profile = await requireProfile()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('/login')

  // Generate a one-time CSRF token and store it server-side so the callback
  // can verify the state was not forged by an attacker.
  const csrf = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  const serviceClient = createServiceClient()
  await serviceClient
    .from('org_google_tokens')
    .upsert(
      { org_id: profile.org_id, calendar_oauth_csrf: csrf, calendar_oauth_csrf_expires_at: expiresAt },
      { onConflict: 'org_id' }
    )

  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/calendar-callback`,
  )

  // Encode user ID (for org lookup) and CSRF token in state as base64url JSON.
  const statePayload = JSON.stringify({ userId: user.id, csrf })
  const state = Buffer.from(statePayload).toString('base64url')

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/business.manage',
    ],
    state,
  })

  return NextResponse.redirect(url)
}
