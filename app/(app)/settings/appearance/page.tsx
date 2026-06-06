import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import AppearanceClient from './AppearanceClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function AppearancePage() {
  const profile = await requireProfile()
  const supabase = await createClient()

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
  const isPaid = ['growth', 'pro', 'platform', 'lifetime', 'tier1', 'tier2', 'tier3', 'starter'].includes(plan)

  return (
    <SettingsPageShell
      title="Appearance"
      description="Theme and typography preferences for your workspace."
      type="form"
    >
      <div className="page-enter pb-12">
        <AppearanceClient
          initialPreset={settings?.theme_preset ?? 'clean-green'}
          initialPrimary={settings?.theme_primary ?? null}
          initialAccent={settings?.theme_accent ?? null}
          initialFont={settings?.theme_font_style ?? 'modern'}
          isPaid={isPaid}
          plan={plan}
        />
      </div>
    </SettingsPageShell>
  )
}
