import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { logger } from '@/lib/logger'

const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data, error } = await supabase
    .from('recommendations')
    .select('id, type, priority, title, body, evidence, entity_type, entity_id, generated_at')
    .eq('org_id', profile.org_id)
    .is('dismissed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(20)

  if (error) {
    logger.error('intelligence/recommendations', error, { op: 'get' }, profile.org_id)
    return NextResponse.json({ error: 'Failed to load recommendations' }, { status: 500 })
  }

  const sorted = (data ?? []).sort(
    (a, b) =>
      (PRIORITY_WEIGHT[a.priority as string] ?? 99) -
      (PRIORITY_WEIGHT[b.priority as string] ?? 99),
  )

  return NextResponse.json({ recommendations: sorted })
}
