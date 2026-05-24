import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('platform_plan_quotas')
    .select('*')
    .order('plan')

  if (error) {
    return NextResponse.json({ error: 'Failed to load plan quotas' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
