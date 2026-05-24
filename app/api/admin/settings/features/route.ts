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
  const { data, error } = await supabase
    .from('platform_feature_flags')
    .select(
      'id, flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, updated_at'
    )
    .order('flag_key')

  if (error) {
    return NextResponse.json({ error: 'Failed to load feature flags' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
