import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import TopBar from '@/components/layout/TopBar'
import SequencesClient from './SequencesClient'

export default async function SequencesPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: sequences } = await supabase
    .from('sequences')
    .select('*, sequence_steps(count), customer_sequences(count)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })

  return (
    <div>
      <TopBar title="Sequences" />
      <div className="px-4 py-4">
        <SequencesClient initialSequences={sequences ?? []} />
      </div>
    </div>
  )
}
