import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { buildCommandCenterPayload } from '@/lib/intelligence/commandCenter'

export async function GET() {
  const profile = await getProfile()
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClientForRequest()
  const orgId = profile.org_id

  const { data: settings } = await supabase
    .from('org_settings')
    .select('command_center_cache')
    .eq('org_id', orgId)
    .maybeSingle()

  const cached = settings?.command_center_cache as Record<string, unknown> | null | undefined
  if (cached && typeof cached === 'object' && cached.generated_at) {
    return NextResponse.json(cached)
  }

  const fresh = await buildCommandCenterPayload(supabase, orgId)
  return NextResponse.json(fresh)
}
