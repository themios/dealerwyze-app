import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

export const runtime     = 'nodejs'
export const maxDuration = 55

/**
 * SaaS lead sync — polls ALL orgs with connected email accounts uniformly.
 * Apollo Auto is just another tenant in email_accounts.
 * Called by cron-job.org every 1 minute → dealerwyze.com/api/cron/sync-leads
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('sync-leads')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // BHPH reminders run in parallel with lead polling
  const bhphPromise = fetch(`${appUrl}/api/bhph/remind`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).then(r => r.json()).catch(() => ({ error: 'failed' }))

  // Poll every org with at least one enabled email account
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('enabled', true)

  const orgIds = [...new Set((rows ?? []).map(r => r.org_id as string))]

  const orgResults: Record<string, unknown> = {}
  for (const orgId of orgIds) {
    try {
      orgResults[orgId] = await runLeadPollForOrg(orgId)
    } catch (e) {
      orgResults[orgId] = { error: String(e) }
    }
  }

  await finishCronRun(runId, 'success', orgIds.length)

  return NextResponse.json({
    bhph:         await bhphPromise,
    org_polls:    orgResults,
    triggered_at: new Date().toISOString(),
  })
}
