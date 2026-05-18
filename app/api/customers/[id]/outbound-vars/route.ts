import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLeadOutboundTemplateVars } from '@/lib/locations/getLeadTemplateVars'

/** GET — location-aware template vars for manual SMS/email compose (Phase 5). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: customerId } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, user_id')
    .eq('id', customerId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Service client needed: getOrgActiveLocations is shared with cron/webhook callers and
  // queries dealer_locations under service role. Ownership already verified above.
  const svc = createServiceClient()
  const vars = await getLeadOutboundTemplateVars(profile.org_id, customerId, svc)

  return NextResponse.json({ vars })
}
