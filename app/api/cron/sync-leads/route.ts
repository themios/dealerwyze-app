import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

export const runtime     = 'nodejs'
export const maxDuration = 60

// Cron services (e.g. cron-job.org) often timeout at 30s — keep total response under that
const ORG_POLL_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

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

  const bhphPromise = fetch(`${appUrl}/api/bhph/remind`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).then(r => r.json()).catch(() => ({ error: 'failed' }))

  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('enabled', true)

  const orgIds = [...new Set((rows ?? []).map(r => r.org_id as string))]

  const orgPromises = orgIds.map(async (orgId) => {
    const result = await withTimeout(
      runLeadPollForOrg(orgId),
      ORG_POLL_TIMEOUT_MS,
      { error: 'Sync timeout (20s)' } as { error: string },
    )
    return { orgId, result }
  })

  const settled = await Promise.allSettled(orgPromises)
  const orgResults: Record<string, unknown> = {}
  for (let i = 0; i < orgIds.length; i++) {
    const o = settled[i]
    const orgId = orgIds[i]
    if (o.status === 'fulfilled') {
      orgResults[orgId] = o.value.result
    } else {
      orgResults[orgId] = { error: String(o.reason) }
    }
  }

  await finishCronRun(runId, 'success', orgIds.length)

  return NextResponse.json({
    bhph:         await bhphPromise,
    org_polls:    orgResults,
    triggered_at: new Date().toISOString(),
  })
}
