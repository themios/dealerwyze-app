import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await requireProfile()
  if (!profile.org_id) return NextResponse.json({ count: 0 })

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('dealer_messages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .eq('sender_type', 'platform')
    .is('read_at', null)

  if (error) return NextResponse.json({ count: 0 })

  return NextResponse.json({ count: count ?? 0 })
}
