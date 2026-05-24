import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import FeatureFlagsClient from '@/components/admin/settings/features/FeatureFlagsClient'

export const dynamic = 'force-dynamic'

export default async function FeatureFlagsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('platform_feature_flags')
    .select('id, flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, updated_at')
    .order('flag_key')

  return <FeatureFlagsClient flags={data ?? []} />
}
