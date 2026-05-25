import { type NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scope = await getAdminVerticalScope(req)
  const vertical = scope.isRE ? 'real_estate' : 'dealer'

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('platform_feature_flags')
    .select(
      'id, flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, updated_at'
    )
    .eq('vertical', vertical)
    .order('flag_key')

  if (error) {
    return NextResponse.json({ error: 'Failed to load feature flags' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
