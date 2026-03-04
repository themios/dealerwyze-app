export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import AnalyticsDashboard from './AnalyticsDashboard'

export default async function AnalyticsPage() {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role as UserRole)) redirect('/today')
  return (
    <div>
      <TopBar title="Analytics" />
      <AnalyticsDashboard />
    </div>
  )
}
