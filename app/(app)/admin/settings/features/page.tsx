import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import FeatureFlagsClient from '@/components/admin/settings/features/FeatureFlagsClient'

export const dynamic = 'force-dynamic'

const REALTY_HOSTS = ['realtywyze.us', 'realtywyze.localhost']

export default async function FeatureFlagsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const hdrs = await headers()
  const host = hdrs.get('host') ?? ''
  const vertical = REALTY_HOSTS.some(h => host.includes(h)) ? 'real_estate' : 'dealer'

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('platform_feature_flags')
    .select('id, flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, updated_at')
    .eq('vertical', vertical)
    .order('flag_key')

  return <FeatureFlagsClient flags={data ?? []} />
}
