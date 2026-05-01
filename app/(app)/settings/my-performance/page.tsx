import TopBar from '@/components/layout/TopBar'
import { requireProfile } from '@/lib/auth/profile'
import ScorecardsClient from '@/app/(app)/admin/performance/scorecards/ScorecardsClient'

export default async function MyPerformancePage() {
  await requireProfile()

  return (
    <div>
      <TopBar title="My Performance" />
      <ScorecardsClient self />
    </div>
  )
}
