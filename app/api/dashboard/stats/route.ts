import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computeDashboardStats } from '@/lib/dashboard/computeStats'

export async function GET() {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const service = createServiceClient()
    const { data: org } = await service
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .maybeSingle()

    const stats = await computeDashboardStats(supabase, profile.org_id, org?.name ?? '')
    return NextResponse.json(stats)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
