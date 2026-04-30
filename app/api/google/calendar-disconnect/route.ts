import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { createServiceClient } from '@/lib/supabase/service'

export async function DELETE() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can disconnect Google Calendar' }, { status: 403 })
  }
  const service = createServiceClient()

  const { error } = await service
    .from('org_google_tokens')
    .delete()
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
