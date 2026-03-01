import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'

export const runtime     = 'nodejs'
export const maxDuration = 55

/**
 * Vercel Cron — runs every 15 minutes.
 * 1. Triggers Tim's single-account lead poll (env var credentials).
 * 2. Polls all SaaS orgs that have at least one connected email account.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL!
  const apolloOrg = process.env.APOLLO_USER_ID

  // 1. Tim's env-var poll + BHPH reminders (parallel)
  const [leadsRes, bhphRes] = await Promise.allSettled([
    fetch(`${appUrl}/api/leads/poll?secret=${process.env.LEADS_POLL_SECRET}`, { method: 'GET' }),
    fetch(`${appUrl}/api/bhph/remind`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  ])

  const leadsData = leadsRes.status === 'fulfilled' ? await leadsRes.value.json() : { error: 'failed' }
  const bhphData  = bhphRes.status  === 'fulfilled' ? await bhphRes.value.json()  : { error: 'failed' }

  // 2. Per-org polling for all orgs with connected email accounts
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('enabled', true)

  const orgIds = [...new Set((rows ?? []).map(r => r.org_id as string))]
    .filter(id => id !== apolloOrg) // Tim's org handled by env-var poll above

  const orgResults: Record<string, unknown> = {}
  for (const orgId of orgIds) {
    try {
      orgResults[orgId] = await runLeadPollForOrg(orgId)
    } catch (e) {
      orgResults[orgId] = { error: String(e) }
    }
  }

  return NextResponse.json({
    leads:        leadsData,
    bhph:         bhphData,
    org_polls:    orgResults,
    triggered_at: new Date().toISOString(),
  })
}
