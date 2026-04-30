import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import RetentionSettingsClient from './RetentionSettingsClient'

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
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Customer Retention</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Automatically stay in touch with customers after the sale - birthdays, anniversaries, service reminders, and more.
      </p>
      <RetentionSettingsClient
        initialSettings={settings}
        sequences={sequences ?? []}
        postgridApiKey={orgSettings?.postgrid_api_key ?? null}
      />
    </div>
  )
}
