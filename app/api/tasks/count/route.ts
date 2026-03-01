import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()
    const now = new Date().toISOString()

    // Count: status='open' AND (due_at <= now OR due_at IS NULL)
    //        AND (snooze_until IS NULL OR snooze_until < now)
    const { count, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.org_id)
      .eq('status', 'open')
      .or(`due_at.is.null,due_at.lte.${now}`)
      .or(`snooze_until.is.null,snooze_until.lt.${now}`)

    if (error) return NextResponse.json({ count: 0 })

    return NextResponse.json({ count: count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
