export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import WebLeadsClient, { type WebLeadInquiry } from './WebLeadsClient'

// RLS on inventory_inquiries (migration 138) scopes SELECT by get_org_id().

export default async function WebLeadsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: inquiries } = await supabase
    .from('inventory_inquiries')
    .select('id, org_id, vehicle_id, name, email, phone, message, source_url, created_at, status, vehicle:vehicles(year, make, model, public_slug)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (inquiries ?? []) as unknown as WebLeadInquiry[]
  const newCount = rows.filter(r => r.status === 'new').length

  return (
    <div>
      <TopBar title={newCount > 0 ? `Web Leads (${newCount} new)` : 'Web Leads'} />
      <WebLeadsClient initialInquiries={rows} />
    </div>
  )
}
