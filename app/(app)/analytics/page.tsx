export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import AnalyticsDashboard from './AnalyticsDashboard'

export default async function AnalyticsPage() {
  await requireProfile()
  return (
    <div>
      <TopBar title="Analytics" />
      <AnalyticsDashboard />
    </div>
  )
}
