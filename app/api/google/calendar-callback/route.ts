import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'

// Per-org OAuth callback — stores refresh token in org_google_tokens.
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') // user_id passed from /api/google/calendar-connect

  const redirectBase = `${process.env.NEXT_PUBLIC_APP_URL}/settings/organization`

  if (!code) {
    return NextResponse.redirect(`${redirectBase}?calendar=error`)
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/calendar-callback`,
  )

  try {
    const { tokens } = await oauth2.getToken(code)

    if (state && tokens.refresh_token) {
      const service = createServiceClient()

      const { data: profile } = await service
        .from('profiles')
        .select('org_id')
        .eq('id', state)
        .single()

      if (profile?.org_id) {
        await service
          .from('org_google_tokens')
          .upsert({
            org_id: profile.org_id,
            calendar_refresh_token: tokens.refresh_token,
            token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'org_id' })
      }
    }

    return NextResponse.redirect(`${redirectBase}?calendar=connected`)
  } catch (err) {
    console.error('[calendar-callback]', err)
    return NextResponse.redirect(`${redirectBase}?calendar=error`)
  }
}
