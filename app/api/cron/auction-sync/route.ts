import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runAuctionSync } from '@/lib/cron/jobs/auctionSync'

export const runtime = 'nodejs'
export const maxDuration = 55

/**
 * GET /api/cron/auction-sync
 * Runs every 6 hours to sync vehicles from Copart and ACV auctions.
 * Fetches all orgs with sync enabled, pulls new vehicles, and imports them.
 */
export async function GET(req: NextRequest) {
  // Validate Vercel cron secret
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('auction-sync')

  try {
    const result = await runAuctionSync()
    await finishCronRun(runId, 'success')
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[auction-sync] Cron endpoint error:', message)
    await finishCronRun(runId, 'error')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
