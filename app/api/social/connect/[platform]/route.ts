import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { buildOAuthUrl } from '@/lib/social/oauth'

const VALID_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube']

interface RouteParams {
  params: Promise<{ platform: string }>
}

// GET /api/social/connect/[platform] — redirect to platform OAuth
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can connect social accounts' }, { status: 403 })
  }
  const { platform } = await params

  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const oauthUrl = buildOAuthUrl(platform, profile.org_id)
    return NextResponse.redirect(oauthUrl)
  } catch (err) {
    console.error('[social/connect] Error building OAuth URL:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/social?error=oauth_config`
    )
  }
}
