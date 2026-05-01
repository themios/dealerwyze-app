import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import SocialAccountsManager from '@/components/settings/SocialAccountsManager'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export const dynamic = 'force-dynamic'

export default async function SocialSettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, account_label, platform_account_id, is_active, connected_at, token_expires_at')
    .eq('org_id', profile.org_id)
    .order('platform')

  return (
    <SettingsPageShell
      title="Social Media Accounts"
      description="Connect channels for inventory auto-posting and merchandising distribution."
      type="form"
    >
      <div>
        <p className="text-sm text-muted-foreground mb-5">
          Connect your social accounts so DealerWyze can post videos automatically when you list a vehicle.
        </p>
        <SocialAccountsManager initialAccounts={accounts ?? []} />
      </div>
    </SettingsPageShell>
  )
}
