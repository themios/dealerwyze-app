import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'

export const runtime = 'nodejs'

/** Verify Google-signed OIDC bearer token on Pub/Sub push messages */
async function verifyGoogleOidc(authHeader: string | null, audience: string): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  try {
    // Google's public keys endpoint
    const certsRes = await fetch('https://www.googleapis.com/oauth2/v3/certs', { next: { revalidate: 3600 } })
    if (!certsRes.ok) return false
    // Decode header to get kid
    const [headerB64] = token.split('.')
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
    const { keys } = await certsRes.json() as { keys: Array<{ kid: string } & Record<string, string>> }
    const jwk = keys.find(k => k.kid === header.kid)
    if (!jwk) return false
    // Import key and verify
    const key = await crypto.subtle.importKey('jwk' as 'spki', jwk as unknown as ArrayBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const [, payloadB64, sigB64] = token.split('.')
    const data = new TextEncoder().encode(`${token.split('.').slice(0, 2).join('.')}`)
    const sig  = Uint8Array.from(Buffer.from(sigB64, 'base64url'))
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
    if (!valid) return false
    // Verify audience and expiry
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    return payload.aud === audience && payload.exp > Date.now() / 1000
  } catch { return false }
}

export async function POST(req: NextRequest) {
  // Verify the request is a genuine Google Pub/Sub push (signed OIDC token)
  const audience = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/webhook`
  if (!await verifyGoogleOidc(req.headers.get('authorization'), audience)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate it's a real Pub/Sub push message
  const body = await req.json().catch(() => null)
  if (!body?.message?.data) return NextResponse.json({ ok: true })

  // Decode Pub/Sub message — Gmail sends { emailAddress, historyId }
  let emailAddress: string | null = null
  try {
    const decoded = JSON.parse(Buffer.from(body.message.data, 'base64').toString())
    emailAddress = decoded.emailAddress ?? null
  } catch {}

  if (!emailAddress) return NextResponse.json({ ok: true })

  // Look up which org owns this Gmail account
  const supabase = createServiceClient()
  const { data: account } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('imap_user', emailAddress)
    .eq('enabled', true)
    .maybeSingle()

  if (!account) return NextResponse.json({ ok: true })

  // Respond 200 immediately so Pub/Sub doesn't retry, then poll in background
  after(async () => {
    await runLeadPollForOrg(account.org_id)
  })

  return NextResponse.json({ ok: true })
}
