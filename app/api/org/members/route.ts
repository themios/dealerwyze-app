import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/** GET /api/org/members — returns id + display_name for all members in the current org */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('org_id', profile.org_id)
    .order('display_name', { ascending: true })

  return NextResponse.json({ members: data ?? [] })
}
