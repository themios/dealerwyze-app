import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLeadPollForOrg } from '@/lib/leads/poll'

export const runtime = 'nodejs'
export const maxDuration = 55

/**
 * Manual lead poll trigger. Polls all orgs with connected email accounts.
 * Used for debugging and manual sync. Auth: ?secret=LEADS_POLL_SECRET
 * Optional: ?org_id=<uuid> to poll a single org.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.LEADS_POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const specificOrg = req.nextUrl.searchParams.get('org_id')
  const supabase = createServiceClient()

  if (specificOrg) {
    const result = await runLeadPollForOrg(specificOrg)
    if ('error' in result) return NextResponse.json(result, { status: 500 })
    return NextResponse.json(result)
  }

  // Poll all enabled orgs
  const { data: rows } = await supabase
    .from('email_accounts')
    .select('org_id')
    .eq('enabled', true)

  const orgIds = [...new Set((rows ?? []).map(r => r.org_id as string))]
  const results: Record<string, unknown> = {}

  for (const orgId of orgIds) {
    try {
      results[orgId] = await runLeadPollForOrg(orgId)
    } catch (e) {
      results[orgId] = { error: String(e) }
    }
  }

  return NextResponse.json({ org_polls: results })
}
