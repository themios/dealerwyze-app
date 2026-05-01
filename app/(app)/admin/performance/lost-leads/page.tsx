import { redirect } from 'next/navigation'

import TopBar from '@/components/layout/TopBar'
import LostLeadsClient from './LostLeadsClient'
import { requireProfile } from '@/lib/auth/profile'
import { canManagePerformance } from '@/lib/intelligence/performance'

export default async function LostLeadsPage() {
  const profile = await requireProfile()
  if (!canManagePerformance(profile)) redirect('/today')

  return (
    <div>
      <TopBar title="Lost Leads" />
      <LostLeadsClient />
    </div>
  )
}
