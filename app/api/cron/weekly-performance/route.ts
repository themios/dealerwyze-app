import { NextRequest, NextResponse } from 'next/server'

import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { buildMessagingPatternsForOrg } from '@/lib/intelligence/messagingPatterns'
import { runRootCauseBatchForOrg } from '@/lib/intelligence/rootCause'
import { sendCoachingDigestForOrg } from '@/lib/intelligence/coachingDigest'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const orgId = req.nextUrl.searchParams.get('org_id')
  const supabase = createServiceClient()

  const { data: orgSettings } = orgId
    ? await supabase.from('org_settings').select('org_id').eq('org_id', orgId)
    : await supabase.from('org_settings').select('org_id')

  let updated = 0
  let rootCauseWritten = 0
  let digestsSent = 0
  for (const row of orgSettings ?? []) {
    const thisOrgId = row.org_id as string

    try {
      const patterns = await buildMessagingPatternsForOrg(thisOrgId)
      await supabase
        .from('org_settings')
        .update({
          performance_cache: {
            messagingPatterns: patterns,
            generatedAt: new Date().toISOString(),
          },
        })
        .eq('org_id', thisOrgId)
      updated++
    } catch (e) {
      console.warn('[weekly-performance] messagingPatterns failed:', thisOrgId, e)
    }

    try {
      const root = await runRootCauseBatchForOrg({ supabase, orgId: thisOrgId })
      rootCauseWritten += root.written
    } catch (e) {
      console.warn('[weekly-performance] rootCause failed:', thisOrgId, e)
    }

    try {
      const sent = await sendCoachingDigestForOrg({ supabase, orgId: thisOrgId })
      if (sent.ok) digestsSent++
    } catch (e) {
      console.warn('[weekly-performance] coachingDigest failed:', thisOrgId, e)
    }
  }

  return NextResponse.json({ ok: true, updated, rootCauseWritten, digestsSent })
}
