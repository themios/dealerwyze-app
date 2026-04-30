import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  const subscription = await req.json()
  const supabase = await createClient()
  await supabase.from('push_subscriptions').upsert(
    { user_id: profile.id, org_id: profile.org_id, subscription },
    { onConflict: 'user_id' }
  )
  return NextResponse.json({ ok: true })
}
