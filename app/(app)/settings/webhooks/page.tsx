import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'
import WebhooksClient from './WebhooksClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function WebhooksPage() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/settings')

  const supabase = await createClient()
  const { data: webhooks } = await supabase
    .from('org_webhooks')
    .select('id, url, events, active, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  return (
    <SettingsPageShell
      title="Webhooks"
      description="Push CRM events to external systems in real time."
      type="ops"
    >
      <div>
        <WebhooksClient initialWebhooks={webhooks ?? []} />
      </div>
    </SettingsPageShell>
  )
}
