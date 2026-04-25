/** Renew expiring Gmail push watches so real-time email delivery stays uninterrupted. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runGmailWatchRenewal(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ gmailWatchesRenewed: number; gmailWatchesFailed: number }> {
  let gmailWatchesRenewed = 0
  let gmailWatchesFailed = 0

  try {
    const { renewExpiredWatches } = await import('@/lib/gmail/watch')
    const watchResult = await renewExpiredWatches()
    gmailWatchesRenewed = watchResult.renewed
    gmailWatchesFailed = watchResult.failed
    if (gmailWatchesRenewed > 0 || gmailWatchesFailed > 0) {
      console.log(`[check-tasks] Job 14 Gmail watches: ${gmailWatchesRenewed} renewed, ${gmailWatchesFailed} failed`)
    }
  } catch (e) {
    console.error('[check-tasks] Job 14 Gmail watch renewal error:', e)
  }

  return { gmailWatchesRenewed, gmailWatchesFailed }
}
