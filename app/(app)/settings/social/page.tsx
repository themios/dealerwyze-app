import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import SocialAccountsManager from '@/components/settings/SocialAccountsManager'
import SocialDefaultsCard from '@/components/settings/SocialDefaultsCard'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export const dynamic = 'force-dynamic'

export default async function SocialSettingsPage() {
  const hdrs = await headers()
  const isRE = hdrs.get('x-vertical') === 'real_estate'
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
      description={isRE ? 'Connect channels for listing auto-posting and distribution.' : 'Connect channels for inventory auto-posting and merchandising distribution.'}
      type="form"
    >
      <div className="space-y-8">
        <div>
          <p className="text-sm text-muted-foreground mb-5">
            {isRE
              ? 'Connect your social accounts so RealtyWyze can post listing videos automatically when you add a property.'
              : 'Connect your social accounts so DealerWyze can post videos automatically when you list a vehicle.'}
          </p>
          <SocialAccountsManager initialAccounts={accounts ?? []} />
        </div>

        <div className="border-t pt-8">
          <SocialDefaultsCard isRe={isRE} />
        </div>
      </div>
    </SettingsPageShell>
  )
}
