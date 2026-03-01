/**
 * One-time script to generate a Google OAuth refresh token.
 * Requests Gmail + Calendar + Google Business Profile scopes.
 *
 * Usage:
 *   node scripts/get-refresh-token.mjs
 *
 * Then open the printed URL in your browser, sign in as kmaautosinc@gmail.com,
 * grant all permissions, and paste the code back here.
 * Copy the printed refresh token to Vercel as GMAIL_CALENDAR_REFRESH_TOKEN.
 */

import { createServer } from 'http'
import { URL } from 'url'

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const REDIRECT_URI  = 'http://localhost:3001/oauth/callback'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first.')
  console.error('Example: GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/get-refresh-token.mjs')
  process.exit(1)
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/business.manage',
].join(' ')

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id',     CLIENT_ID)
authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope',         SCOPES)
authUrl.searchParams.set('access_type',   'offline')
authUrl.searchParams.set('prompt',        'consent') // forces new refresh token even if previously authorized

console.log('\n=== Step 1: Open this URL in your browser ===')
console.log(authUrl.toString())
console.log('\nSign in as kmaautosinc@gmail.com and grant ALL permissions.\n')

// Local server to catch the redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3001')
  const code = url.searchParams.get('code')

  if (!code) {
    res.end('No code received.')
    return
  }

  res.end('<h2>Got it! Check your terminal for the refresh token.</h2>')

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error) {
    console.error('\n❌ Error:', tokens.error, tokens.error_description)
    server.close()
    return
  }

  console.log('\n=== Step 2: Copy this to Vercel as GMAIL_CALENDAR_REFRESH_TOKEN ===')
  console.log(tokens.refresh_token)
  console.log('\nDone! You can close this terminal after copying the token.')

  server.close()
})

server.listen(3001, () => {
  console.log('Waiting for Google to redirect... (listening on http://localhost:3001)')
})
