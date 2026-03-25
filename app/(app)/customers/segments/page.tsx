export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import SegmentsClient from './SegmentsClient'

export default async function SegmentsPage() {
  const profile = await requireProfile()
  const service = createServiceClient()

  // Fetch saved segments for this org
  const { data: savedSegments } = await service
    .from('saved_segments')
    .select('id, name, filters, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  // Fetch sequences for the enroll dropdown
  const { data: sequences } = await service
    .from('sequences')
    .select('id, name, channel')
    .eq('org_id', profile.org_id)
    .order('name', { ascending: true })

  // Fetch agents for the "assigned to" filter
  const { data: agents } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('org_id', profile.org_id)
    .is('deactivated_at', null)
    .order('display_name', { ascending: true })

  return (
    <div>
      <TopBar title="Customer Segments" />
      <SegmentsClient
        initialSegments={savedSegments ?? []}
        sequences={sequences ?? []}
        agents={agents ?? []}
      />
    </div>
  )
}
