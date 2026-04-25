import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import AppearanceClient from './AppearanceClient'

export default async function AppearancePage() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('theme_preset, theme_primary, theme_accent, theme_font_style')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('plan')
      .eq('id', profile.org_id)
      .single(),
  ])

  const plan = (org?.plan ?? 'free').toLowerCase()
  const isPaid = plan === 'growth' || plan === 'pro'

  return (
    <div className="page-enter">
      <TopBar title="Appearance" />
      <div className="p-4 max-w-2xl mx-auto pb-12">
        <AppearanceClient
          initialPreset={settings?.theme_preset ?? 'dealerwyze'}
          initialPrimary={settings?.theme_primary ?? null}
          initialAccent={settings?.theme_accent ?? null}
          initialFont={settings?.theme_font_style ?? 'modern'}
          isPaid={isPaid}
          plan={plan}
        />
      </div>
    </div>
  )
}
