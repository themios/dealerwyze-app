import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runReceiptTasks } from '@/lib/cron/jobs/receiptTasks'
import { runInventoryAging } from '@/lib/cron/jobs/inventoryAging'
import { runDormantCustomers } from '@/lib/cron/jobs/dormantCustomers'
import { runQuotaReset } from '@/lib/cron/jobs/quotaReset'
import { runResponseTimeAlerts } from '@/lib/cron/jobs/responseTimeAlerts'
import { runAdminAlerts } from '@/lib/cron/jobs/adminAlerts'
import { runDataRetention } from '@/lib/cron/jobs/dataRetention'
import { runOnboardingNudges } from '@/lib/cron/jobs/onboardingNudges'
import { runSequenceDelivery } from '@/lib/cron/jobs/sequenceDelivery'
import { runFullAutoSequence } from '@/lib/cron/jobs/fullAutoSequence'
import { runReviewRequests } from '@/lib/cron/jobs/reviewRequests'
import { runGmailWatchRenewal } from '@/lib/cron/jobs/gmailWatchRenewal'
import { runGmailTokenHealth } from '@/lib/cron/jobs/gmailTokenHealth'
import { runPulseSurveys } from '@/lib/cron/jobs/pulseSurveys'
import { runAppointmentRemindersV2 } from '@/lib/cron/jobs/appointmentRemindersV2'
import { runAbuseDetection } from '@/lib/cron/jobs/abuseDetection'

export const runtime = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('check-tasks')
  const supabase = createServiceClient()

  // Per-job result tracking — each job records 'ok' or an error message.
  // Jobs run independently so a failure in one does not skip the rest.
  const jobResults: Record<string, string> = {}

  async function runJob<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn()
      jobResults[name] = 'ok'
      return result
    } catch (err) {
      console.error(`[check-tasks] job "${name}" failed:`, err)
      jobResults[name] = err instanceof Error ? err.message : 'error'
      return undefined
    }
  }

  let receipts:    Awaited<ReturnType<typeof runReceiptTasks>>         | undefined
  let dormant:     Awaited<ReturnType<typeof runDormantCustomers>>      | undefined
  let quotas:      Awaited<ReturnType<typeof runQuotaReset>>            | undefined
  let alerts:      Awaited<ReturnType<typeof runResponseTimeAlerts>>    | undefined
  let adminResult: Awaited<ReturnType<typeof runAdminAlerts>>           | undefined
  let nudges:      Awaited<ReturnType<typeof runOnboardingNudges>>      | undefined
  let seqDelivery: Awaited<ReturnType<typeof runSequenceDelivery>>      | undefined
  let fullAuto:    Awaited<ReturnType<typeof runFullAutoSequence>>       | undefined
  let reviews:     Awaited<ReturnType<typeof runReviewRequests>>        | undefined
  let gmailWatch:  Awaited<ReturnType<typeof runGmailWatchRenewal>>     | undefined
  let gmailTokens: Awaited<ReturnType<typeof runGmailTokenHealth>>      | undefined
  let apptV2:      Awaited<ReturnType<typeof runAppointmentRemindersV2>>| undefined
  let abuse:       Awaited<ReturnType<typeof runAbuseDetection>>        | undefined

  try {
    receipts    = await runJob('receiptTasks',            () => runReceiptTasks(supabase))
    await          runJob('inventoryAging',               () => runInventoryAging(supabase))
    dormant     = await runJob('dormantCustomers',        () => runDormantCustomers(supabase))
    quotas      = await runJob('quotaReset',              () => runQuotaReset(supabase))
    alerts      = await runJob('responseTimeAlerts',      () => runResponseTimeAlerts(supabase))
    adminResult = await runJob('adminAlerts',             () => runAdminAlerts(supabase))
    await          runJob('dataRetention',                () => runDataRetention(supabase))
    nudges      = await runJob('onboardingNudges',        () => runOnboardingNudges(supabase))
    seqDelivery = await runJob('sequenceDelivery',        () => runSequenceDelivery(supabase))
    fullAuto    = await runJob('fullAutoSequence',         () => runFullAutoSequence(supabase))
    reviews     = await runJob('reviewRequests',          () => runReviewRequests(supabase))
    gmailWatch  = await runJob('gmailWatchRenewal',       () => runGmailWatchRenewal())
    gmailTokens = await runJob('gmailTokenHealth',        () => runGmailTokenHealth(supabase))
    await          runJob('pulseSurveys',                 () => runPulseSurveys(supabase))
    apptV2      = await runJob('appointmentRemindersV2',  () => runAppointmentRemindersV2(supabase))
    abuse       = await runJob('abuseDetection',           () => runAbuseDetection(supabase))
  } finally {
    const anyFailed = Object.values(jobResults).some(v => v !== 'ok')
    await finishCronRun(runId, anyFailed ? 'partial_failure' : 'success', adminResult?.allOrgsCount)
  }

  return NextResponse.json({
    receipts_tasked:             receipts?.receiptsTasked,
    dormant_marked:              dormant?.dormantMarked,
    quotas_reset:                quotas?.quotasReset,
    response_alerts:             alerts?.responseAlerts,
    admin_alerts:                adminResult?.adminAlerts,
    onboarding_nudges:           nudges?.onboardingNudges,
    sequence_sent:               seqDelivery?.sequenceSent,
    full_auto_fired:             fullAuto?.fullAutoFired,
    review_requests_sent:        reviews?.reviewRequestsSent,
    gmail_watches_renewed:       gmailWatch?.gmailWatchesRenewed,
    gmail_watches_failed:        gmailWatch?.gmailWatchesFailed,
    gmail_tokens_ok:             gmailTokens?.gmailTokensOk,
    gmail_tokens_revoked:        gmailTokens?.gmailTokensRevoked,
    reminders_queued:            apptV2?.remindersQueued,
    abuse_flags_created:         abuse?.flagsCreated,
    job_results:                 jobResults,
  })
}
