import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// One-time OAuth callback to get a Calendar refresh token.
// Visit /api/google/calendar-auth to start the flow.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return new NextResponse('Missing code parameter', { status: 400 })
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/calendar-callback`,
  )

  try {
    const { tokens } = await oauth2.getToken(code)
    const html = `
      <html><body style="font-family:monospace;padding:2rem">
        <h2>✅ Calendar OAuth Success</h2>
        <p>Add this to your <code>.env.local</code> and Vercel env vars:</p>
        <pre style="background:#f0f0f0;padding:1rem;border-radius:4px">GMAIL_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token ?? '(null — re-run with prompt=consent)'}</pre>
        <p style="color:#666">You can close this tab.</p>
      </body></html>
    `
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    return new NextResponse(`Error: ${err}`, { status: 500 })
  }
}
