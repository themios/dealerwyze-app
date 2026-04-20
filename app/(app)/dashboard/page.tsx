export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { computeDashboardStats } from '@/lib/dashboard/computeStats'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('name')
    .eq('id', profile.org_id)
    .maybeSingle()

  const stats = await computeDashboardStats(supabase, profile.org_id, org?.name ?? '')

  return (
    <div className="min-h-dvh page-enter">
      <TopBar
        left={<span className="text-sm font-semibold tracking-wide">DealerWyze</span>}
        right={
          <Link href="/search">
            <Button variant="ghost" size="sm"><Search className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <DashboardClient stats={stats} />
    </div>
  )
}
