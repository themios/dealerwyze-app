import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runAccountLifecycle } from '@/lib/cron/jobs/accountLifecycle'

// GET /api/cron/account-lifecycle
// Daily: trial expiry → grace → free tier downgrade → suspension + warning emails
export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('account-lifecycle')
  try {
    const supabase = createServiceClient()
    const { processed } = await runAccountLifecycle(supabase)
    await finishCronRun(runId, 'success', processed)
    return NextResponse.json({ processed })
  } catch (err) {
    await finishCronRun(runId, 'error', undefined, String(err))
    throw err
  }
}
