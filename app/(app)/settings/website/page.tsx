import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import WebsiteSettingsClient from '@/components/settings/WebsiteSettingsClient'
import WebsiteAnalytics from '@/components/settings/WebsiteAnalytics'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export const dynamic = 'force-dynamic'

export default async function WebsiteSettingsPage() {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    redirect('/settings')
  }

  const supabase = await createClientForRequest()

  const { data: org } = await supabase
    .from('organizations')
    .select('slug, public_inventory_enabled, website_tagline, custom_domain')
    .eq('id', profile.org_id)
    .single()

  return (
    <SettingsPageShell
      title="Website Settings"
      description="Public inventory page, custom domain details, and customer-facing website controls."
      type="form"
    >
      <div className="max-w-lg space-y-8">
        <WebsiteSettingsClient
          slug={org?.slug ?? ''}
          initialEnabled={org?.public_inventory_enabled ?? false}
          initialTagline={org?.website_tagline ?? ''}
          initialDomain={org?.custom_domain ?? ''}
        />

        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading analytics...</p>}>
          <WebsiteAnalytics />
        </Suspense>
      </div>
    </SettingsPageShell>
  )
}
