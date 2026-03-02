import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/fax
 * Returns fax history for the org, newest first, limit 50.
 */
export async function GET(): Promise<NextResponse> {
  let profile
  try {
    profile = await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('faxes')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[fax GET] db error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch fax history' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
