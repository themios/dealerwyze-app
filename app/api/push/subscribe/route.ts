import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscription = await req.json()
  const service = createServiceClient()
  await service.from('push_subscriptions').upsert(
    { user_id: user.id, subscription },
    { onConflict: 'user_id' }
  )
  return NextResponse.json({ ok: true })
}
