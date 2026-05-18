import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runWeeklyOwnerSummary } from '@/lib/cron/jobs/weeklyOwnerSummary'

export const runtime     = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId    = await startCronRun('weekly-summary')
  const supabase = createServiceClient()

  try {
    const result = await runWeeklyOwnerSummary(supabase)
    await finishCronRun(runId, 'success', result.sent ? 1 : 0)
    return NextResponse.json({ ok: true, sent: result.sent })
  } catch (err) {
    await finishCronRun(runId, 'partial_failure', 0)
    console.error('[weekly-summary] failed:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
