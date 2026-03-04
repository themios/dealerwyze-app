import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function DELETE() {
  const profile = await requireProfile()
  const service = createServiceClient()

  const { error } = await service
    .from('org_google_tokens')
    .delete()
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
