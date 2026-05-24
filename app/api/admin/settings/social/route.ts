import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const [connectorsRes, accountsRes] = await Promise.all([
    supabase.from('platform_connector_config').select('*').order('connector_key'),
    supabase
      .from('platform_social_accounts')
      .select(
        'id, platform, account_label, platform_account_id, is_active, token_expires_at, last_used_at, last_error, last_error_at, created_at'
      )
      .order('platform'),
  ])

  if (connectorsRes.error || accountsRes.error) {
    return NextResponse.json({ error: 'Failed to load social connector settings' }, { status: 500 })
  }

  return NextResponse.json({
    connectors: connectorsRes.data ?? [],
    accounts: accountsRes.data ?? [],
  })
}
