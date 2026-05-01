import { redirect } from 'next/navigation'

import TopBar from '@/components/layout/TopBar'
import ScorecardsClient from './ScorecardsClient'
import { requireProfile } from '@/lib/auth/profile'
import { canManagePerformance } from '@/lib/intelligence/performance'

export default async function AdminScorecardsPage() {
  const profile = await requireProfile()
  if (!canManagePerformance(profile)) redirect('/today')

  return (
    <div>
      <TopBar title="Rep Scorecards" />
      <ScorecardsClient />
    </div>
  )
}
