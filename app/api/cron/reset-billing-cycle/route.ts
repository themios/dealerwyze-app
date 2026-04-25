import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Daily cron — reset billing cycle counts for orgs whose cycle has ended.
 * Auth: x-cron-secret header = LEADS_POLL_SECRET
 *
 * Register on cron-job.org: daily at 00:05 UTC
 *   URL: https://dealerwyze.com/api/cron/reset-billing-cycle
 *   Header: x-cron-secret: <LEADS_POLL_SECRET>
 */
export async function GET(req: NextRequest) {
  const provided = Buffer.from(req.headers.get('x-cron-secret') ?? '')
  const expected = Buffer.from(process.env.LEADS_POLL_SECRET ?? '')
  if (
    expected.length === 0 ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today    = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Find orgs where billing_cycle_end has passed
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, billing_cycle_start, billing_cycle_end')
    .lt('billing_cycle_end', today)
    .not('billing_cycle_end', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ reset: 0, message: 'No cycles due', triggered_at: new Date().toISOString() })
  }

  let reset = 0
  const errors: string[] = []

  for (const org of orgs) {
    try {
      // Advance cycle: new start = day after old end, new end = ~1 month later
      const oldEnd  = new Date(org.billing_cycle_end)
      const newStart = new Date(oldEnd)
      newStart.setDate(newStart.getDate() + 1)
      const newEnd = new Date(newStart)
      newEnd.setMonth(newEnd.getMonth() + 1)
      newEnd.setDate(newEnd.getDate() - 1)

      const { error: updateErr } = await supabase
        .from('organizations')
        .update({
          monthly_message_count: 0,
          monthly_mms_count:     0,
          monthly_voice_seconds: 0,
          billing_cycle_start:   newStart.toISOString().slice(0, 10),
          billing_cycle_end:     newEnd.toISOString().slice(0, 10),
        })
        .eq('id', org.id)

      if (updateErr) {
        errors.push(`${org.id}: ${updateErr.message}`)
      } else {
        reset++
      }
    } catch (err) {
      errors.push(`${org.id}: ${err}`)
    }
  }

  return NextResponse.json({
    reset,
    errors: errors.length > 0 ? errors : undefined,
    triggered_at: new Date().toISOString(),
  })
}
