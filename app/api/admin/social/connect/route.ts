import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { buildPlatformMetaOAuthUrl } from '@/lib/social/platformOauth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { platform?: string } | null
  if (!body || body.platform !== 'facebook') {
    return NextResponse.json({ error: 'unsupported_platform' }, { status: 400 })
  }

  const url = buildPlatformMetaOAuthUrl()
  return NextResponse.json({ url })
}
