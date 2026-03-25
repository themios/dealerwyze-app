import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { createServiceClient } from '@/lib/supabase/service'
import ReviewSettingsClient from './ReviewSettingsClient'

export default async function ReviewSettingsPage() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/settings')

  const service = createServiceClient()
  const { data: settings } = await service
    .from('org_settings')
    .select('google_review_url, review_request_enabled, review_request_delay_days')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return (
    <ReviewSettingsClient
      googleReviewUrl={settings?.google_review_url ?? ''}
      reviewRequestEnabled={settings?.review_request_enabled ?? false}
      reviewRequestDelayDays={settings?.review_request_delay_days ?? 0}
    />
  )
}
