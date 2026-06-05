export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import CustomersListClient from '@/components/customer/CustomersListClient'
import { Suspense } from 'react'
import AddLeadMenu from '@/components/leads/AddLeadMenu'
import ProspectExtractorButton from './ProspectExtractorButton'
import PipelineBoard from '@/app/(app)/pipeline/PipelineBoard'
import { Button } from '@/components/ui/button'
import { List, GitBranch, UserX, Archive, Layers } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { isDealerAdmin } from '@/types/index'
import { isRepRestricted, canManageUsers, canAssignLeads } from '@/lib/auth/dealerRoles'
import { DEFAULT_ORG_STAGES, OrgStage } from '@/lib/leads/states'
import { applyCustomerLocationFilter, isValidOrgLocationId } from '@/lib/customers/listQuery'
import { isMultiLocationFromCount } from '@/lib/locations/uiRules'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string; location_id?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const isAdmin = isDealerAdmin(profile.role)
  const isOrgOwner = profile.id === profile.org_id
  const isRep = isRepRestricted(profile.role) && !isOrgOwner

  const { archived: showArchivedParam, view, location_id: locationIdParam } = await searchParams
  const showArchived = showArchivedParam === '1'
  const showPipeline = view === 'pipeline'

  let locationFilter: string | null = null
  if (locationIdParam === 'unassigned') {
    locationFilter = 'unassigned'
  } else if (locationIdParam?.trim()) {
    const valid = await isValidOrgLocationId(supabase, profile.org_id, locationIdParam.trim())
    if (valid) locationFilter = locationIdParam.trim()
  }

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

  if (locationFilter && !showArchived) {
    query = applyCustomerLocationFilter(query, locationFilter)
  }

  const { data: customers } = await query.order('created_at', { ascending: false })

  const [{ data: membersData }, { data: activeLocations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, location_id')
      .eq('org_id', profile.org_id)
      .is('deactivated_at', null)
      .order('display_name', { ascending: true }),
    supabase
      .from('dealer_locations')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])
  const locations = activeLocations ?? []
  const isMultiLocation = isMultiLocationFromCount(locations.length)

  const members = membersData ?? []
  const memberMap = new Map(members.map(m => [m.id, m]))
  const orgOwner = members.find(m => m.id === profile.org_id) ?? null
  const leadsWithAssignee = (customers ?? []).map(c => ({
    ...c,
    assignee: c.assigned_to ? (memberMap.get(c.assigned_to) ?? null) : null,
  }))

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
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, role, location_id')
      .eq('org_id', profile.org_id)
      .is('deactivated_at', null)
      .order('created_at', { ascending: true })
    agents = data ?? []
  }

  const { data: orgStagesData } = await supabase
    .from('org_pipeline_stages')
    .select('stage_key, label, color, position, is_hot, is_active')
    .eq('org_id', profile.org_id)
    .order('position', { ascending: true })
  const orgStages: OrgStage[] = orgStagesData?.length ? orgStagesData : DEFAULT_ORG_STAGES

  const title = showArchived ? 'Archived Leads' : `Leads (${leadsWithAssignee.length})`

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
            <div className="flex items-center gap-2">
              <ProspectExtractorButton />
              <AddLeadMenu />
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
            <Link
              href="/customers?archived=1"
              title="View archived leads"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archived</span>
            </Link>
          </div>
        </div>
      )}

      {showPipeline ? (
        <PipelineBoard customers={leadsWithAssignee} lastActivityMap={lastActivityMap} orgStages={orgStages} />
      ) : !leadsWithAssignee || leadsWithAssignee.length === 0 ? (
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
        <Suspense>
          <CustomersListClient
            customers={leadsWithAssignee}
            isAdmin={isAdmin}
            isRep={isRep}
            agents={agents}
            members={members}
            isMultiLocation={isMultiLocation}
            locations={isMultiLocation ? locations : []}
            canReassignLeads={canAssignLeads(profile.role)}
            lastActivityMap={lastActivityMap}
            lastCallMap={lastCallMap}
            lastSmsMap={lastSmsMap}
            lastEmailMap={lastEmailMap}
            showArchived={showArchived}
            orgOwner={orgOwner}
          />
        </Suspense>
      )}
    </div>
  )
}
