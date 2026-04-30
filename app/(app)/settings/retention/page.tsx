import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import RetentionSettingsClient from './RetentionSettingsClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function RetentionSettingsPage() {
  const profile  = await requireProfile()
  const supabase = await createClient()

  const [{ data: settings }, { data: sequences }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('retention_settings')
      .select('*')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('sequences')
      .select('id, name, channel')
      .eq('org_id', profile.org_id)
      .order('name'),
    supabase
      .from('org_settings')
      .select('postgrid_api_key')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
  ])

  return (
    <SettingsPageShell
      title="Customer Retention"
      description="Automatically stay in touch after the sale with birthdays, anniversaries, service reminders, and referral follow-ups."
      type="form"
    >
      <RetentionSettingsClient
        initialSettings={settings}
        sequences={sequences ?? []}
        postgridApiKey={orgSettings?.postgrid_api_key ?? null}
      />
    </SettingsPageShell>
  )
}
