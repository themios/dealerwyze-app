import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import VideoSettingsForm from '@/components/settings/VideoSettingsForm'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export const dynamic = 'force-dynamic'

export default async function VideoSettingsPage() {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    redirect('/settings')
  }

  const supabase = await createClient()

  const [{ data: videoSettings }, { data: templates }, { data: org }] = await Promise.all([
    supabase
      .from('org_video_settings')
      .select('*')
      .eq('org_id', profile.org_id)
      .maybeSingle(),

    supabase
      .from('video_templates')
      .select('id, name, description, aspect_ratio, duration_seconds')
      .eq('is_active', true)
      .order('sort_order'),

    supabase
      .from('organizations')
      .select('plan')
      .eq('id', profile.org_id)
      .single(),
  ])

  const PLAN_RENDER_QUOTA: Record<string, number> = { growth: 25, pro: 75 }
  const planLimit = PLAN_RENDER_QUOTA[(org?.plan ?? 'growth').toLowerCase()] ?? 25

  return (
    <SettingsPageShell
      title="Video Settings"
      description="Control templates, voice, and autopost defaults for inventory video generation."
      type="form"
    >
      <div>
        <VideoSettingsForm
          initialSettings={videoSettings}
          templates={templates ?? []}
          planLimit={planLimit}
        />
      </div>
    </SettingsPageShell>
  )
}
