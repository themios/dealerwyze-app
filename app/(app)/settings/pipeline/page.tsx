import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'
import PipelineStagesClient from './PipelineStagesClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function PipelineSettingsPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) redirect('/settings')

  return (
    <SettingsPageShell
      title="Pipeline Stages"
      description="Tune your sales process labels and stage order."
      type="form"
    >
      <div className="max-w-lg">
        <p className="text-sm text-muted-foreground mb-4">
          Rename stages to match your sales process, reorder them, and enable up to 5 custom stages. Changes apply immediately to the pipeline board and lead status picker.
        </p>
        <PipelineStagesClient />
      </div>
    </SettingsPageShell>
  )
}
