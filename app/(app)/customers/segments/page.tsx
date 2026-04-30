export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import SegmentsClient from './SegmentsClient'

export default async function SegmentsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch saved segments for this org
  const { data: savedSegments } = await supabase
    .from('saved_segments')
    .select('id, name, filters, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  // Fetch sequences for the enroll dropdown
  const { data: sequences } = await supabase
    .from('sequences')
    .select('id, name, channel')
    .eq('org_id', profile.org_id)
    .order('name', { ascending: true })

  // Fetch agents for the "assigned to" filter
  const { data: agents } = await supabase
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
