export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import CustomersListClient from '@/components/customer/CustomersListClient'
import PasteLeadDialog from '@/components/customer/PasteLeadDialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const isAdmin = profile.role === 'admin'

  const { archived: showArchivedParam } = await searchParams
  const showArchived = showArchivedParam === '1'

  let query = supabase
    .from('customers')
    .select('*')
    .eq('user_id', profile.org_id)

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

  // Fetch agents list for admin bulk-assign dropdown
  let agents: { id: string; display_name: string; role: string }[] = []
  if (isAdmin) {
    const service = createServiceClient()
    const { data } = await service
      .from('profiles')
      .select('id, display_name, role')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: true })
    agents = data ?? []
  }

  const title = showArchived
    ? 'Archived Customers'
    : `Customers (${customers?.length ?? 0})`

  return (
    <div>
      <TopBar
        title={title}
        right={
          !showArchived ? (
            <div className="flex items-center gap-1">
              <PasteLeadDialog />
              <Link href="/customers/new">
                <Button size="sm" variant="ghost">
                  <Plus className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {!customers || customers.length === 0 ? (
        showArchived ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">🗄️</p>
            <p className="font-medium">No archived customers</p>
            <Link href="/customers">
              <Button className="mt-4" variant="outline">Back to Active</Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">👤</p>
            <p className="font-medium">No customers yet</p>
            <Link href="/customers/new">
              <Button className="mt-4">Add First Customer</Button>
            </Link>
          </div>
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
