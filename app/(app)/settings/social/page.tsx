import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SocialAccountsManager from '@/components/settings/SocialAccountsManager'

export const dynamic = 'force-dynamic'

export default async function SocialSettingsPage() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, account_label, platform_account_id, is_active, connected_at, token_expires_at')
    .eq('org_id', profile.org_id)
    .order('platform')

  return (
    <div>
      <TopBar
        title="Social Media Accounts"
        right={
          <Link href="/settings">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground mb-5">
          Connect your social accounts so DealerWyze can post videos automatically when you list a vehicle.
        </p>
        <SocialAccountsManager initialAccounts={accounts ?? []} />
      </div>
    </div>
  )
}
