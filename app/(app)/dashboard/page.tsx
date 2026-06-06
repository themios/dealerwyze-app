export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { computeDashboardStats } from '@/lib/dashboard/computeStats'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Inbox, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const hdrs = await headers()
  const isRE = hdrs.get('x-vertical') === 'real_estate'
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.org_id)
    .maybeSingle()

  // Server component: wall clock for rolling 7d web-lead count (not a client re-render).
  // eslint-disable-next-line react-hooks/purity -- intentional time window for dashboard stats
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: webInquiries7d } = await supabase
    .from('inventory_inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .gte('created_at', since7d)

  const stats = await computeDashboardStats(supabase, profile.org_id, org?.name ?? '')

  const webCount = webInquiries7d ?? 0
  const isOwner = profile.role === 'dealer_admin' || profile.role === 'admin'

  return (
    <div className="min-h-dvh page-enter">
      <TopBar
        hideSearch
        left={
          isRE
            ? <span className="text-sm font-bold tracking-wide">RealtyWyze<span className="text-[#F07018]">.US</span></span>
            : <span className="text-sm font-semibold tracking-wide">DealerWyze</span>
        }
        right={
          <>
            <Link href="/leads/web" title="Web Leads">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white gap-1.5 h-9 px-2 sm:px-2.5"
              >
                <Inbox className="h-4 w-4 shrink-0" />
                <span className="hidden text-xs font-medium sm:inline">Web Leads</span>
                {webCount > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-green-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                    {webCount > 99 ? '99+' : webCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/search" aria-label="Search" title="Search">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white h-9 w-9 p-0">
                <Search className="h-4 w-4" />
              </Button>
            </Link>
          </>
        }
      />
      <DashboardClient stats={stats} isOwner={isOwner} isRE={isRE} />
    </div>
  )
}
