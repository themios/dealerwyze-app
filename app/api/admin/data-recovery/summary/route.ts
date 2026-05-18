import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const TABLES = [
  { key: 'customers', table: 'deleted_customers' },
  { key: 'activities', table: 'deleted_activities' },
  { key: 'vehicles', table: 'deleted_vehicles' },
  { key: 'ledger_transactions', table: 'deleted_ledger_transactions' },
] as const

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const results = await Promise.all(
    TABLES.map(t =>
      supabase
        .from(t.table)
        .select('*', { count: 'exact', head: true })
        .is('purged_at', null)
        .is('restored_at', null)
        .gte('expires_at', now),
    ),
  )

  const by_table: Record<string, number> = {}
  let total = 0

  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i]
    const r = results[i]
    const count = r.count ?? 0
    by_table[t.key] = count
    total += count
  }

  return NextResponse.json({ total, by_table })
}

