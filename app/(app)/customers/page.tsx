export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import CustomersListClient from '@/components/customer/CustomersListClient'
import PasteLeadDialog from '@/components/customer/PasteLeadDialog'
import ImportLeadsDialog from '@/components/leads/ImportLeadsDialog'
import ScanLeadButton from '@/components/leads/ScanLeadButton'
import PipelineBoard from '@/app/(app)/pipeline/PipelineBoard'
import { Button } from '@/components/ui/button'
import { Plus, List, GitBranch, UserX, Archive } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { isDealerAdmin, hasFullOrgAccess } from '@/types/index'
import { isRepRestricted, canManageUsers } from '@/lib/auth/dealerRoles'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const isAdmin = isDealerAdmin(profile.role)
  const isRep = isRepRestricted(profile.role)

  const { archived: showArchivedParam, view } = await searchParams
  const showArchived = showArchivedParam === '1'
  const showPipeline = view === 'pipeline'

  let query = supabase
    .from('customers')
    .select('*')
    .eq('user_id', profile.org_id)

  // Sales reps see only their assigned leads
  if (isRep) {
    query = query.eq('assigned_to', profile.id)
  }

  if (showArchived) {
    query = query.eq('archived', true)
  } else {
    query = query.or('archived.is.null,archived.eq.false')
  }

  const { data: customers } = await query.order('created_at', { ascending: false })

  // Batch-fetch most recent activity per customer (any direction)
  const customerIds = (customers ?? []).map(c => c.id)
  let lastActivityMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('customer_id, created_at')
      .in('customer_id', customerIds)
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: false })
    // Keep only the most recent per customer
    for (const a of acts ?? []) {
      if (a.customer_id && !lastActivityMap[a.customer_id]) {
        lastActivityMap[a.customer_id] = a.created_at
      }
    }
  }

  // Fetch agents list for admin/manager bulk-assign dropdown
  let agents: { id: string; display_name: string; role: string }[] = []
  if (canManageUsers(profile.role)) {
    const service = createServiceClient()
    const { data } = await service
      .from('profiles')
      .select('id, display_name, role')
      .eq('org_id', profile.org_id)
      .is('deactivated_at', null)
      .order('created_at', { ascending: true })
    agents = data ?? []
  }

  const title = showArchived ? 'Archived' : `Leads (${customers?.length ?? 0})`

  const viewToggle = !showArchived && (
    <div className="flex items-center rounded-md overflow-hidden border border-white/20">
      <Link
        href="/customers"
        className={`flex items-center gap-1 px-2 py-1 text-xs ${!showPipeline ? 'bg-white/20 text-white' : 'text-white/60'}`}
      >
        <List className="h-3.5 w-3.5" />
        List
      </Link>
      <Link
        href="/customers?view=pipeline"
        className={`flex items-center gap-1 px-2 py-1 text-xs ${showPipeline ? 'bg-white/20 text-white' : 'text-white/60'}`}
      >
        <GitBranch className="h-3.5 w-3.5" />
        Pipeline
      </Link>
    </div>
  )

  return (
    <div>
      <TopBar
        title={title}
        right={
          !showArchived ? (
            <div className="flex items-center gap-2">
              {viewToggle}
              {!showPipeline && (
                <>
                  <ScanLeadButton />
                  <PasteLeadDialog />
                  <ImportLeadsDialog />
                  <Link href="/customers/new" title="Add lead">
                    <Button size="sm" variant="ghost" title="Add lead">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {showPipeline ? (
        <PipelineBoard customers={customers ?? []} />
      ) : !customers || customers.length === 0 ? (
        showArchived ? (
          <EmptyState
            icon={Archive}
            title="No archived customers"
            action={{ label: 'Back to Active', href: '/customers' }}
          />
        ) : (
          <EmptyState
            icon={UserX}
            title="No leads yet"
            description="Add your first lead to get started"
            action={{ label: 'Add First Lead', href: '/customers/new' }}
          />
        )
      ) : (
        <CustomersListClient
          customers={customers}
          isAdmin={isAdmin}
          agents={agents}
          lastActivityMap={lastActivityMap}
          showArchived={showArchived}
        />
      )}
    </div>
  )
}
