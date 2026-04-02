import { NextRequest, NextResponse } from 'next/server'
import { verifyOAuthState } from '@/lib/social/oauth'
import { createServiceClient } from '@/lib/supabase/service'

const APP_URL        = process.env.NEXT_PUBLIC_APP_URL ?? ''
const META_APP_ID    = process.env.META_APP_ID ?? ''
const META_APP_SECRET= process.env.META_APP_SECRET ?? ''
const TIKTOK_KEY     = process.env.TIKTOK_CLIENT_KEY ?? ''
const TIKTOK_SECRET  = process.env.TIKTOK_CLIENT_SECRET ?? ''
const YOUTUBE_ID     = process.env.YOUTUBE_CLIENT_ID ?? ''
const YOUTUBE_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? ''

interface RouteParams {
  params: Promise<{ platform: string }>
}

const GRAPH = 'https://graph.facebook.com/v19.0'

function errorRedirect(platform: string, reason: string) {
  return NextResponse.redirect(`${APP_URL}/settings/social?error=${reason}&platform=${platform}`)
}

function successRedirect(platform: string) {
  return NextResponse.redirect(`${APP_URL}/settings/social?connected=${platform}`)
}

// GET /api/social/callback/[platform] — OAuth callback handler
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { platform } = await params
  const url      = new URL(req.url)
  const code     = url.searchParams.get('code')
  const state    = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) return errorRedirect(platform, 'user_denied')
  if (!code || !state) return errorRedirect(platform, 'missing_params')

  // Verify state (timing-safe)
  const stateData = verifyOAuthState(state)
  if (!stateData || stateData.platform !== platform) {
    return errorRedirect(platform, 'invalid_state')
  }

  const orgId = stateData.orgId
  const supabase = createServiceClient()

  try {
    switch (platform) {
      case 'facebook':
      case 'instagram':
        await handleMetaCallback(orgId, code, platform, supabase)
        break
      case 'tiktok':
        await handleTikTokCallback(orgId, code, supabase)
        break
      case 'youtube':
        await handleYouTubeCallback(orgId, code, supabase)
        break
      default:
        return errorRedirect(platform, 'unknown_platform')
    }
    return successRedirect(platform)
  } catch (err) {
    console.error(`[social/callback/${platform}] Error:`, err)
    return errorRedirect(platform, 'token_exchange_failed')
  }
}

async function handleMetaCallback(
  orgId: string,
  code: string,
  platform: 'facebook' | 'instagram',
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const redirect = `${APP_URL}/api/social/callback/${platform}`

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}` +
    `&client_secret=${META_APP_SECRET}&code=${code}`
  )
  if (!tokenRes.ok) throw new Error('Meta token exchange failed')
  const tokenData = await tokenRes.json() as { access_token: string }

  // Exchange for long-lived token (60-day)
  const llRes = await fetch(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  if (!llRes.ok) throw new Error('Meta long-lived token exchange failed')
  const llData = await llRes.json() as { access_token: string; expires_in?: number }
  const longToken = llData.access_token
  const expiresAt = new Date(Date.now() + ((llData.expires_in ?? 5184000) * 1000))

  // Fetch user's pages
  const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${longToken}`)
  const pagesData = await pagesRes.json() as {
    data?: Array<{ id: string; name: string; access_token: string }>
  }
  const pages = pagesData.data ?? []

  for (const page of pages) {
    // Upsert Facebook page account
    await supabase.from('social_accounts').upsert({
      org_id:             orgId,
      platform:           'facebook',
      platform_account_id: page.id,
      account_label:      page.name,
      access_token:       page.access_token, // page-level token
      token_expires_at:   expiresAt.toISOString(),
      page_id:            page.id,
      is_active:          true,
    }, { onConflict: 'org_id,platform,platform_account_id' })

    // Try to fetch linked Instagram Business Account
    try {
      const igRes = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      )
      const igData = await igRes.json() as { instagram_business_account?: { id: string } }
      if (igData.instagram_business_account?.id) {
        const igId = igData.instagram_business_account.id
        // Get IG account username
        const igInfoRes = await fetch(`${GRAPH}/${igId}?fields=name,username&access_token=${page.access_token}`)
        const igInfo = await igInfoRes.json() as { name?: string; username?: string }
        await supabase.from('social_accounts').upsert({
          org_id:             orgId,
          platform:           'instagram',
          platform_account_id: igId,
          account_label:      igInfo.name ?? igInfo.username ?? page.name,
          access_token:       page.access_token,
          token_expires_at:   expiresAt.toISOString(),
          page_id:            page.id,
          instagram_business_account_id: igId,
          is_active:          true,
        }, { onConflict: 'org_id,platform,platform_account_id' })
      }
    } catch {
      // IG not linked — not an error
    }
  }
}

async function handleTikTokCallback(
  orgId: string,
  code: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const redirect = `${APP_URL}/api/social/callback/tiktok`
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    TIKTOK_KEY,
      client_secret: TIKTOK_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  redirect,
    }),
  })
  const tokenBody = await tokenRes.json() as {
    data?: { access_token: string; refresh_token: string; expires_in: number; open_id: string }
    error?: { code: string; message: string }
  }
  if (!tokenRes.ok || (tokenBody.error && tokenBody.error.code !== 'ok')) {
    console.error('[tiktok/callback] token exchange failed:', JSON.stringify(tokenBody))
    throw new Error(tokenBody.error?.message ?? 'TikTok token exchange failed')
  }
  const td = tokenBody.data!

  // Get user info
  const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,username', {
    headers: { 'Authorization': `Bearer ${td.access_token}` },
  })
  const userData = await userRes.json() as { data?: { user?: { display_name?: string; username?: string } } }
  const displayName = userData.data?.user?.display_name ?? userData.data?.user?.username ?? 'TikTok Account'

  const { error: upsertError } = await supabase.from('social_accounts').upsert({
    org_id:              orgId,
    platform:            'tiktok',
    platform_account_id: td.open_id,
    account_label:       displayName,
    access_token:        td.access_token,
    refresh_token:       td.refresh_token,
    token_expires_at:    new Date(Date.now() + td.expires_in * 1000).toISOString(),
    is_active:           true,
  }, { onConflict: 'org_id,platform,platform_account_id' })

  if (upsertError) {
    console.error('[tiktok/callback] upsert failed:', JSON.stringify(upsertError))
    throw new Error('Failed to save TikTok account')
  }
}

async function handleYouTubeCallback(
  orgId: string,
  code: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const redirect = `${APP_URL}/api/social/callback/youtube`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     YOUTUBE_ID,
      client_secret: YOUTUBE_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  redirect,
    }),
  })
  if (!tokenRes.ok) throw new Error('YouTube token exchange failed')
  const data = await tokenRes.json() as {
    access_token: string; refresh_token?: string; expires_in: number
  }

  // Get channel info
  const chanRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { 'Authorization': `Bearer ${data.access_token}` } }
  )
  const chanData = await chanRes.json() as {
    items?: Array<{ id: string; snippet: { title: string } }>
  }
  const channel = chanData.items?.[0]
  if (!channel) throw new Error('No YouTube channel found')

  await supabase.from('social_accounts').upsert({
    org_id:              orgId,
    platform:            'youtube',
    platform_account_id: channel.id,
    account_label:       channel.snippet.title,
    access_token:        data.access_token,
    refresh_token:       data.refresh_token ?? null,
    token_expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
    is_active:           true,
  }, { onConflict: 'org_id,platform,platform_account_id' })
}
