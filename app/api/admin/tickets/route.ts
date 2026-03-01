import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('support_tickets')
    .select(`
      id, subject, status, priority, created_at, resolved_at,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  return NextResponse.json(data ?? [])
}
