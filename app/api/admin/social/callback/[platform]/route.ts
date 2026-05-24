import { NextRequest, NextResponse } from 'next/server'
import { verifyPlatformOAuthState } from '@/lib/social/platformOauth'
import { createServiceClient } from '@/lib/supabase/service'

// SETUP REQUIRED: Add /api/admin/social/callback/facebook to Meta app's
// allowed redirect URIs in the Meta Developer Console before testing.

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''
const META_APP_ID = process.env.META_APP_ID ?? ''
const META_APP_SECRET = process.env.META_APP_SECRET ?? ''
const GRAPH = 'https://graph.facebook.com/v19.0'

interface RouteParams {
  params: Promise<{ platform: string }>
}

function redirectToSocial(req: NextRequest, query: string) {
  if (APP_URL) {
    return NextResponse.redirect(`${APP_URL}/admin/settings/social?${query}`)
  }
  return NextResponse.redirect(new URL(`/admin/settings/social?${query}`, req.url))
}

async function handlePlatformMetaCallback(
  code: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const redirect = `${APP_URL}/api/admin/social/callback/facebook`

  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&client_secret=${META_APP_SECRET}&code=${code}`
  )
  if (!tokenRes.ok) throw new Error('Meta token exchange failed')
  const tokenData = (await tokenRes.json()) as { access_token: string }

  const llRes = await fetch(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
  )
  if (!llRes.ok) throw new Error('Meta long-lived token exchange failed')
  const llData = (await llRes.json()) as { access_token: string; expires_in?: number }
  const longToken = llData.access_token
  const expiresAt = new Date(Date.now() + (llData.expires_in ?? 5184000) * 1000)
  const nowIso = new Date().toISOString()

  const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${longToken}`)
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>
  }
  const pages = pagesData.data ?? []

  for (const page of pages) {
    await supabase.from('platform_social_accounts').upsert(
      {
        platform: 'facebook',
        platform_account_id: page.id,
        account_label: page.name,
        access_token: page.access_token,
        token_expires_at: expiresAt.toISOString(),
        page_id: page.id,
        is_active: true,
        updated_at: nowIso,
      },
      { onConflict: 'platform,platform_account_id' }
    )

    try {
      const igRes = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      )
      const igData = (await igRes.json()) as { instagram_business_account?: { id: string } }
      if (igData.instagram_business_account?.id) {
        const igId = igData.instagram_business_account.id
        const igInfoRes = await fetch(
          `${GRAPH}/${igId}?fields=name,username&access_token=${page.access_token}`
        )
        const igInfo = (await igInfoRes.json()) as { name?: string; username?: string }
        await supabase.from('platform_social_accounts').upsert(
          {
            platform: 'instagram',
            platform_account_id: igId,
            account_label: igInfo.name ?? igInfo.username ?? page.name,
            access_token: page.access_token,
            token_expires_at: expiresAt.toISOString(),
            page_id: page.id,
            instagram_business_account_id: igId,
            is_active: true,
            updated_at: nowIso,
          },
          { onConflict: 'platform,platform_account_id' }
        )
      }
    } catch {
      // IG not linked for this page; continue.
    }
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { platform } = await params
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (errorParam) return redirectToSocial(req, 'error=user_denied')
  if (!code || !state) return redirectToSocial(req, 'error=missing_params')

  const stateData = verifyPlatformOAuthState(state)
  if (!stateData || stateData.platform !== platform) {
    return redirectToSocial(req, 'error=invalid_state')
  }

  const supabase = createServiceClient()
  try {
    switch (platform) {
      case 'facebook':
        await handlePlatformMetaCallback(code, supabase)
        break
      default:
        return redirectToSocial(req, 'error=unknown_platform')
    }
    return redirectToSocial(req, 'connected=facebook')
  } catch (error) {
    console.error('[admin/social/callback] token exchange failed', error)
    return redirectToSocial(req, 'error=token_exchange_failed')
  }
}
