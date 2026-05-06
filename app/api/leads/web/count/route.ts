import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await requireProfile()

  const supabase = await createClient()

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('inventory_inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .gte('created_at', since)

  return NextResponse.json({ count: count ?? 0 })
}
