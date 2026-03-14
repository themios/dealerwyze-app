import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'

export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'tickets')
  if (denied) return denied

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')

  return NextResponse.json({ open: count ?? 0 })
}
