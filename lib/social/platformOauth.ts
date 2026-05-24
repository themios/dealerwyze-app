import crypto from 'crypto'

const STATE_SECRET = process.env.SOCIAL_OAUTH_STATE_SECRET ?? ''
const STATE_TTL_MS = 10 * 60 * 1000
const META_APP_ID = process.env.META_APP_ID ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

export function signPlatformOAuthState(platform: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const exp = Date.now() + STATE_TTL_MS
  const data = JSON.stringify({ type: 'platform', platform, nonce, exp })
  const b64 = Buffer.from(data).toString('base64url')
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('hex')
  return `${b64}.${sig}`
}

export function verifyPlatformOAuthState(state: string): { platform: string } | null {
  try {
    const dotIndex = state.lastIndexOf('.')
    if (dotIndex === -1) return null
    const b64 = state.slice(0, dotIndex)
    const sig = state.slice(dotIndex + 1)
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('hex')
    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
    const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
    if (data.type !== 'platform') return null
    if (typeof data.exp === 'number' && Date.now() > data.exp) return null
    return { platform: data.platform }
  } catch {
    return null
  }
}

export function buildPlatformMetaOAuthUrl(): string {
  const state = signPlatformOAuthState('facebook')
  const redirect = `${APP_URL}/api/admin/social/callback/facebook`
  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish',
  ].join(',')
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: redirect,
    scope: scopes,
    state,
    response_type: 'code',
  })
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`
}
