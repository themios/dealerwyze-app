import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'accounts')
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('last_active_at')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const preferred_channel =
    org.last_active_at && new Date(org.last_active_at).getTime() > cutoff
      ? 'in_app'
      : 'email'

  return NextResponse.json({ preferred_channel })
}
