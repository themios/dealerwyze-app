import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VideoSettingsForm from '@/components/settings/VideoSettingsForm'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VideoSettingsPage() {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    redirect('/settings')
  }

  const supabase = createServiceClient()

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
    <div>
      <TopBar
        title="Video Settings"
        right={
          <Link href="/settings">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <div className="px-4 py-4">
        <VideoSettingsForm
          initialSettings={videoSettings}
          templates={templates ?? []}
          planLimit={planLimit}
        />
      </div>
    </div>
  )
}
