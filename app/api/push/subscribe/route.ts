import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  const subscription = await req.json()
  const service = createServiceClient()
  await service.from('push_subscriptions').upsert(
    { user_id: profile.id, subscription },
    { onConflict: 'user_id' }
  )
  return NextResponse.json({ ok: true })
}
