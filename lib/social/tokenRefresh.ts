import { createServiceClient } from '@/lib/supabase/service'

const META_APP_ID     = process.env.META_APP_ID ?? ''
const META_APP_SECRET = process.env.META_APP_SECRET ?? ''
const TIKTOK_KEY      = process.env.TIKTOK_CLIENT_KEY ?? ''
const TIKTOK_SECRET   = process.env.TIKTOK_CLIENT_SECRET ?? ''
const YOUTUBE_ID      = process.env.YOUTUBE_CLIENT_ID ?? ''
const YOUTUBE_SECRET  = process.env.YOUTUBE_CLIENT_SECRET ?? ''
interface SocialAccount {
  id: string
  org_id: string
  platform: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

const DAYS_BEFORE_EXPIRY_TO_REFRESH = 7

/**
 * Refresh a single social account token if it expires within 7 days.
 * Pass orgId to verify the account belongs to the expected org (security guard).
 */
export async function refreshSocialToken(accountId: string, orgId?: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, org_id, platform, access_token, refresh_token, token_expires_at')
    .eq('id', accountId)
    .single()

  if (!account) return

  // Security: if caller provided an orgId, verify the account belongs to that org
  if (orgId && account.org_id !== orgId) {
    throw new Error(`[tokenRefresh] Account ${accountId} belongs to org ${account.org_id}, but caller passed org ${orgId}`)
  }

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null
  const now       = new Date()
  const daysUntilExpiry = expiresAt
    ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    : -1

  if (daysUntilExpiry > DAYS_BEFORE_EXPIRY_TO_REFRESH) return // Not due yet

  try {
    switch (account.platform) {
      case 'facebook':
      case 'instagram':
        await refreshMetaToken(account)
        break
      case 'tiktok':
        await refreshTikTokToken(account)
        break
      case 'youtube':
        await refreshYouTubeToken(account)
        break
    }
  } catch (err) {
    console.error(`[tokenRefresh] Failed to refresh ${account.platform} token for account ${accountId}:`, err)
  }
}

/**
 * Refresh all social tokens that expire within 7 days.
 * Called by the daily cron job.
 */
export async function refreshAllExpiringTokens(): Promise<void> {
  const supabase = createServiceClient()
  const threshold = new Date(Date.now() + DAYS_BEFORE_EXPIRY_TO_REFRESH * 24 * 60 * 60 * 1000)

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('is_active', true)
    .lte('token_expires_at', threshold.toISOString())

  if (!accounts) return

  for (const { id } of accounts) {
    await refreshSocialToken(id)
  }
}

async function updateTokenInDB(
  accountId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null,
): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('social_accounts').update({
    access_token:     accessToken,
    refresh_token:    refreshToken,
    token_expires_at: expiresAt?.toISOString() ?? null,
  }).eq('id', accountId)
}

async function refreshMetaToken(account: SocialAccount): Promise<void> {
  // Exchange short-lived token for long-lived (60-day) token
  const res = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}` +
    `&fb_exchange_token=${account.access_token}`
  )
  if (!res.ok) throw new Error(`Meta token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in?: number }
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // default 60 days
  await updateTokenInDB(account.id, data.access_token, null, expiresAt)
}

async function refreshTikTokToken(account: SocialAccount): Promise<void> {
  if (!account.refresh_token) throw new Error('No TikTok refresh token')
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    TIKTOK_KEY,
      client_secret: TIKTOK_SECRET,
      grant_type:    'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`TikTok token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await updateTokenInDB(account.id, data.access_token, data.refresh_token, expiresAt)
}

async function refreshYouTubeToken(account: SocialAccount): Promise<void> {
  if (!account.refresh_token) throw new Error('No YouTube refresh token')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     YOUTUBE_ID,
      client_secret: YOUTUBE_SECRET,
      grant_type:    'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await updateTokenInDB(account.id, data.access_token, account.refresh_token, expiresAt)
}
