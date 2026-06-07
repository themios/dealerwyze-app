import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Auction sync cron job.
 * Runs every 6 hours to sync vehicles from configured auction platforms.
 * This handler will be expanded in Plan 04 to include actual sync logic.
 */
export async function POST(req: NextRequest) {
  // Validate cron auth (bearer token from Vercel cron)
  const denied = validateCronAuth(req)
  if (denied) return denied

  const supabase = createServiceClient()

  try {
    // Get all orgs with auction sync enabled
    const { data: configs, error } = await supabase
      .from('org_auction_sync_config')
      .select('*')
      .eq('enabled', true)
      .gt('last_sync_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()) // Last sync > 6 hours ago

    if (error) {
      console.error('[auction-sync] Failed to fetch configs:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch configs' },
        { status: 500 }
      )
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orgs configured for auction sync',
        processed: 0,
      })
    }

    // TODO: Plan 04 will implement sync logic here
    // For now, just record that cron executed
    console.log(`[auction-sync] Processing ${configs.length} orgs`)

    return NextResponse.json({
      success: true,
      message: `Processed ${configs.length} orgs`,
      processed: configs.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[auction-sync]', message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
