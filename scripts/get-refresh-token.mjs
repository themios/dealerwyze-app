/**
 * One-time script to generate a Google OAuth refresh token.
 * Requests Gmail + Calendar + Google Business Profile scopes.
 *
 * Usage:
 *   node scripts/get-refresh-token.mjs
 *
 * Then open the printed URL in your browser, sign in as apolloai.us@gmail.com,
 * grant all permissions, and paste the code back here.
 * Copy the printed refresh token to Vercel as GMAIL_CALENDAR_REFRESH_TOKEN.
 */

import { createServer } from 'http'
import { URL } from 'url'

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const START_PORT    = parseInt(process.env.PORT, 10) || 3001

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

// Redirect URI is set once we bind to a port (see listen callback)
let redirectUri = `http://localhost:${START_PORT}/oauth/callback`

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id',     CLIENT_ID)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope',         SCOPES)
authUrl.searchParams.set('access_type',   'offline')
authUrl.searchParams.set('prompt',        'consent') // forces new refresh token even if previously authorized

// Local server to catch the redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${START_PORT}`)
  const code = url.searchParams.get('code')

  if (!code) {
    res.end('No code received.')
    return
  }

  res.end('<h2>Got it! Check your terminal for the refresh token.</h2>')

  // Exchange code for tokens (use current redirectUri)
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  redirectUri,
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

let nextPortToTry = START_PORT

function tryListen() {
  if (nextPortToTry > 3010) {
    console.error('No available port between 3001 and 3010. Free one or set PORT=3002 etc.')
    process.exit(1)
  }
  const port = nextPortToTry
  server.listen(port, () => {
    redirectUri = `http://localhost:${port}/oauth/callback`
    authUrl.searchParams.set('redirect_uri', redirectUri)

    console.log('\n=== Step 1: Open this URL in your browser ===')
    console.log(authUrl.toString())
    console.log('\nSign in as apolloai.us@gmail.com and grant ALL permissions.\n')
    console.log(`Waiting for Google to redirect... (listening on http://localhost:${port})`)
    if (port !== 3001) {
      console.log(`Note: Using port ${port} (3001 was in use). Add http://localhost:${port}/oauth/callback to your OAuth client if needed.`)
    }
  })
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    nextPortToTry += 1
    tryListen()
  } else {
    console.error(err)
    process.exit(1)
  }
})

tryListen()
