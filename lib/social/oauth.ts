import crypto from 'crypto'

const STATE_SECRET = process.env.SOCIAL_OAUTH_STATE_SECRET ?? ''
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ---- State signing ----

export function signOAuthState(payload: { orgId: string; platform: string }): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const exp   = Date.now() + STATE_TTL_MS
  const data  = JSON.stringify({ ...payload, nonce, exp })
  const b64   = Buffer.from(data).toString('base64url')
  const sig   = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('hex')
  return `${b64}.${sig}`
}

export function verifyOAuthState(state: string): { orgId: string; platform: string } | null {
  try {
    const dotIndex = state.lastIndexOf('.')
    if (dotIndex === -1) return null
    const b64     = state.slice(0, dotIndex)
    const sig     = state.slice(dotIndex + 1)
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('hex')
    const sigBuf      = Buffer.from(sig,      'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expectedBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
    const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
    if (typeof data.exp === 'number' && Date.now() > data.exp) return null
    return { orgId: data.orgId, platform: data.platform }
  } catch {
    return null
  }
}

// ---- OAuth URL builders ----

const META_APP_ID     = process.env.META_APP_ID ?? ''
const TIKTOK_KEY      = process.env.TIKTOK_CLIENT_KEY ?? ''
const YOUTUBE_ID      = process.env.YOUTUBE_CLIENT_ID ?? ''
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? ''

export function buildFacebookOAuthUrl(orgId: string): string {
  const state    = signOAuthState({ orgId, platform: 'facebook' })
  const redirect = `${APP_URL}/api/social/callback/facebook`
  const scopes   = ['pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'].join(',')
  const params   = new URLSearchParams({ client_id: META_APP_ID, redirect_uri: redirect, scope: scopes, state, response_type: 'code' })
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`
}

export function buildInstagramOAuthUrl(orgId: string): string {
  // Instagram uses the same Meta app — identical OAuth, different scope emphasis
  const state    = signOAuthState({ orgId, platform: 'instagram' })
  const redirect = `${APP_URL}/api/social/callback/instagram`
  const scopes   = ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement', 'pages_manage_posts'].join(',')
  const params   = new URLSearchParams({ client_id: META_APP_ID, redirect_uri: redirect, scope: scopes, state, response_type: 'code' })
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`
}

export function buildTikTokOAuthUrl(orgId: string): string {
  const state    = signOAuthState({ orgId, platform: 'tiktok' })
  const redirect = `${APP_URL}/api/social/callback/tiktok`
  const scopes   = ['user.info.basic', 'video.publish'].join(',')
  const params   = new URLSearchParams({ client_key: TIKTOK_KEY, redirect_uri: redirect, scope: scopes, state, response_type: 'code' })
  return `https://www.tiktok.com/v2/auth/authorize?${params}`
}

export function buildYouTubeOAuthUrl(orgId: string): string {
  const state    = signOAuthState({ orgId, platform: 'youtube' })
  const redirect = `${APP_URL}/api/social/callback/youtube`
  const scopes   = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'].join(' ')
  const params   = new URLSearchParams({
    client_id: YOUTUBE_ID, redirect_uri: redirect, scope: scopes,
    state, response_type: 'code', access_type: 'offline', prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function buildOAuthUrl(platform: string, orgId: string): string {
  switch (platform) {
    case 'facebook':  return buildFacebookOAuthUrl(orgId)
    case 'instagram': return buildInstagramOAuthUrl(orgId)
    case 'tiktok':    return buildTikTokOAuthUrl(orgId)
    case 'youtube':   return buildYouTubeOAuthUrl(orgId)
    default:          throw new Error(`Unknown platform: ${platform}`)
  }
}
