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
import { Plus, List, GitBranch, UserX, Archive, Layers } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { isDealerAdmin } from '@/types/index'
import { isRepRestricted, canManageUsers } from '@/lib/auth/dealerRoles'
import { DEFAULT_ORG_STAGES, OrgStage } from '@/lib/leads/states'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const isAdmin = isDealerAdmin(profile.role)
  const isOrgOwner = profile.id === profile.org_id
  const isRep = isRepRestricted(profile.role) && !isOrgOwner

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

  // Exclude customers that were merged into another record
  query = query.is('merged_at', null)

  if (showArchived) {
    query = query.eq('archived', true)
  } else {
    query = query.or('archived.is.null,archived.eq.false')
  }

  const { data: customers } = await query.order('created_at', { ascending: false })

  // Batch-fetch most recent activity per customer and by channel/type.
  const customerIds = (customers ?? []).map(c => c.id)
  const lastActivityMap: Record<string, string> = {}
  const lastCallMap: Record<string, string> = {}
  const lastSmsMap: Record<string, string> = {}
  const lastEmailMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('customer_id, created_at, type')
      .in('customer_id', customerIds)
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: false })

    // Keep only the most recent per customer (overall and by channel).
    for (const a of acts ?? []) {
      if (!a.customer_id) continue

      if (!lastActivityMap[a.customer_id]) {
        lastActivityMap[a.customer_id] = a.created_at
      }

      if (a.type === 'call' && !lastCallMap[a.customer_id]) {
        lastCallMap[a.customer_id] = a.created_at
      }
      if (a.type === 'sms' && !lastSmsMap[a.customer_id]) {
        lastSmsMap[a.customer_id] = a.created_at
      }
      if (a.type === 'email' && !lastEmailMap[a.customer_id]) {
        lastEmailMap[a.customer_id] = a.created_at
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

  // Fetch org pipeline stages for pipeline board
  const serviceForStages = createServiceClient()
  const { data: orgStagesData } = await serviceForStages
    .from('org_pipeline_stages')
    .select('stage_key, label, color, position, is_hot, is_active')
    .eq('org_id', profile.org_id)
    .order('position', { ascending: true })
  const orgStages: OrgStage[] = orgStagesData?.length ? orgStagesData : DEFAULT_ORG_STAGES

  const title = showArchived ? 'Archived Leads' : `Leads (${customers?.length ?? 0})`

  return (
    <div>
      <TopBar
        title={title}
        right={
          showArchived ? (
            <Link href="/customers" title="Back to active leads">
              <Button size="sm" variant="ghost" className="text-white/70 hover:text-white text-xs gap-1">
                <List className="h-4 w-4" />
                Active
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-0.5">
              <Link href="/customers/new" title="Add lead">
                <Button size="sm" variant="ghost" title="Add lead" className="text-white/70 hover:text-white">
                  <Plus className="h-5 w-5" />
                </Button>
              </Link>
              <ScanLeadButton />
              <PasteLeadDialog />
              <ImportLeadsDialog />
              <Link href="/customers?archived=1" title="View archived leads">
                <Button size="sm" variant="ghost" className="text-white/70 hover:text-white">
                  <Archive className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          )
        }
      />

      {/* Sub-nav: view tabs only */}
      {!showArchived && (
        <div className="sticky top-12 z-10 flex items-center px-3 py-2 bg-background border-b border-border">
          <div className="flex items-center rounded-md overflow-hidden border border-border">
            <Link
              href="/customers"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${!showPipeline ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <List className="h-3.5 w-3.5" />
              <span>List</span>
            </Link>
            <Link
              href="/customers?view=pipeline"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border transition-colors ${showPipeline ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Pipeline</span>
            </Link>
            <Link
              href="/customers/segments"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Segments</span>
            </Link>
          </div>
        </div>
      )}

      {showPipeline ? (
        <PipelineBoard customers={customers ?? []} lastActivityMap={lastActivityMap} orgStages={orgStages} />
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
          lastCallMap={lastCallMap}
          lastSmsMap={lastSmsMap}
          lastEmailMap={lastEmailMap}
          showArchived={showArchived}
        />
      )}
    </div>
  )
}
