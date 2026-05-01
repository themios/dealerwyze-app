import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import SequencesClient from './SequencesClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function SequencesPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: sequences } = await supabase
    .from('sequences')
    .select('*, sequence_steps(count), customer_sequences(count)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })

  return (
    <SettingsPageShell
      title="Sequences"
      description="Create and manage reusable SMS and email follow-up cadences."
      type="ops"
    >
      <div>
        <SequencesClient initialSequences={sequences ?? []} />
      </div>
    </SettingsPageShell>
  )
}
