import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import SocialConnectorClient from '@/components/admin/settings/social/SocialConnectorClient'

export const dynamic = 'force-dynamic'

export default async function PlatformSocialSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
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

  return (
    <SocialConnectorClient
      connectors={connectorsRes.data ?? []}
      accounts={accountsRes.data ?? []}
    />
  )
}
