import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { customer_id } = await req.json() as { customer_id: string }

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Auto-complete overdue call/task activities for this customer
  await supabase
    .from('activities')
    .update({ completed_at: now, outcome: 'auto_reconciled' })
    .eq('user_id', profile.org_id)
    .eq('customer_id', customer_id)
    .is('completed_at', null)
    .in('type', ['task', 'call'])
    .lte('due_at', now)

  return NextResponse.json({ ok: true })
}
