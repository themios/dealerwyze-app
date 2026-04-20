import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { redirect } from 'next/navigation'
import PipelineStagesClient from './PipelineStagesClient'

export default async function PipelineSettingsPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) redirect('/settings')

  return (
    <div>
      <TopBar title="Pipeline Stages" />
      <div className="px-4 py-4 max-w-lg">
        <p className="text-sm text-muted-foreground mb-4">
          Rename stages to match your sales process, reorder them, and enable up to 5 custom stages. Changes apply immediately to the pipeline board and lead status picker.
        </p>
        <PipelineStagesClient />
      </div>
    </div>
  )
}
