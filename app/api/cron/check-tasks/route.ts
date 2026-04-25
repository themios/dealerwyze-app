import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runReceiptTasks } from '@/lib/cron/jobs/receiptTasks'
import { runInventoryAging } from '@/lib/cron/jobs/inventoryAging'
import { runDormantCustomers } from '@/lib/cron/jobs/dormantCustomers'
import { runQuotaReset } from '@/lib/cron/jobs/quotaReset'
import { runAppointmentReminders } from '@/lib/cron/jobs/appointmentReminders'
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

export const runtime = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('check-tasks')
  const supabase = createServiceClient()

  const [receipts]   = await Promise.all([runReceiptTasks(supabase)])
  await runInventoryAging(supabase)
  const dormant      = await runDormantCustomers(supabase)
  const quotas       = await runQuotaReset(supabase)
  const reminders    = await runAppointmentReminders(supabase)
  const alerts       = await runResponseTimeAlerts(supabase)
  const adminResult  = await runAdminAlerts(supabase)
  await runDataRetention(supabase)
  const nudges       = await runOnboardingNudges(supabase)
  const seqDelivery  = await runSequenceDelivery(supabase)
  const fullAuto     = await runFullAutoSequence(supabase)
  const reviews      = await runReviewRequests(supabase)
  const gmailWatch   = await runGmailWatchRenewal(supabase)
  const gmailTokens  = await runGmailTokenHealth(supabase)
  await runPulseSurveys(supabase)
  const apptV2       = await runAppointmentRemindersV2(supabase)

  await finishCronRun(runId, 'success', adminResult.allOrgsCount)

  return NextResponse.json({
    receipts_tasked:             receipts.receiptsTasked,
    dormant_marked:              dormant.dormantMarked,
    quotas_reset:                quotas.quotasReset,
    appointment_reminders_sent:  reminders.remindersent,
    response_alerts:             alerts.responseAlerts,
    admin_alerts:                adminResult.adminAlerts,
    onboarding_nudges:           nudges.onboardingNudges,
    sequence_sent:               seqDelivery.sequenceSent,
    full_auto_fired:             fullAuto.fullAutoFired,
    review_requests_sent:        reviews.reviewRequestsSent,
    gmail_watches_renewed:       gmailWatch.gmailWatchesRenewed,
    gmail_watches_failed:        gmailWatch.gmailWatchesFailed,
    gmail_tokens_ok:             gmailTokens.gmailTokensOk,
    gmail_tokens_revoked:        gmailTokens.gmailTokensRevoked,
    reminders_queued:            apptV2.remindersQueued,
  })
}
