import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/** GET — count pending buyer showing requests for sidebar badge (RE only). */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (org?.vertical !== 'real_estate') {
    return NextResponse.json({ count: 0 })
  }

  const { count } = await supabase
    .from('showing_requests')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .eq('agent_id', profile.id)
    .eq('status', 'pending')

  return NextResponse.json({ count: count ?? 0 })
}
