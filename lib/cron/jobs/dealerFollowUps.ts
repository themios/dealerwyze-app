/**
 * Dealer onboarding follow-up sequence.
 *
 * D+1 (~24h after signup): day-one tips — fires once after signup, regardless of onboarding status.
 * D+3 (~72h after signup): check-in — fires if onboarding still incomplete.
 * D+7 (~7d after signup):  re-engage  — fires if onboarding still incomplete.
 *
 * Each step is deduplicated via admin_alerts.alert_type so it fires exactly once per org.
 * Orgs that complete onboarding skip D+3 and D+7 (no point nudging a setup that is done).
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import {
  buildDayOneTipsEmailHtml,
  buildDayThreeFollowUpHtml,
  buildDaySevenFollowUpHtml,
} from '@/lib/email/onboarding'
import type { createServiceClient } from '@/lib/supabase/service'

interface FollowUpStep {
  alertType:  string
  minHours:   number   // minimum hours since org created_at before this fires
  subject:    string
  buildHtml:  (name: string, appUrl: string) => string
  onlyIfIncomplete: boolean  // skip if onboarding already done
}

const STEPS: FollowUpStep[] = [
  {
    alertType:        'dealer_followup_d1',
    minHours:         20,
    subject:          '3 things to do first in DealerWyze',
    buildHtml:        buildDayOneTipsEmailHtml,
    onlyIfIncomplete: false,
  },
  {
    alertType:        'dealer_followup_d3',
    minHours:         60,
    subject:          'How is setup going?',
    buildHtml:        buildDayThreeFollowUpHtml,
    onlyIfIncomplete: true,
  },
  {
    alertType:        'dealer_followup_d7',
    minHours:         156,  // ~6.5 days — fires on day 7 window
    subject:          'Still here for you',
    buildHtml:        buildDaySevenFollowUpHtml,
    onlyIfIncomplete: true,
  },
]

export async function runDealerFollowUps(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ dealerFollowUpsSent: number }> {
  try {
    let dealerFollowUpsSent = 0
    // Fetch all approved dealer orgs with their onboarding status
    // RE orgs skip this sequence — their follow-up templates are dealer-specific
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, created_at, vertical')
      .not('approved_at', 'is', null)
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .eq('vertical', 'dealer')

    if (!orgs?.length) return { dealerFollowUpsSent }

    const orgIds = orgs.map(o => o.id)

    // Fetch onboarding completion status for all orgs in one query
    const { data: settings } = await supabase
      .from('org_settings')
      .select('org_id, onboarding_completed_at')
      .in('org_id', orgIds)

    const onboardingDoneSet = new Set(
      (settings ?? []).filter(s => s.onboarding_completed_at).map(s => s.org_id)
    )

    // Fetch already-sent follow-up alert types for all orgs in one query
    const { data: existingAlerts } = await supabase
      .from('admin_alerts')
      .select('org_id, alert_type')
      .in('org_id', orgIds)
      .in('alert_type', STEPS.map(s => s.alertType))

    const sentSet = new Set(
      (existingAlerts ?? []).map(a => `${a.org_id}:${a.alert_type}`)
    )

    const now = Date.now()

    for (const org of orgs) {
      const orgAgHours = (now - new Date(org.created_at).getTime()) / 3600000
      const onboardingDone = onboardingDoneSet.has(org.id)

      for (const step of STEPS) {
        if (orgAgHours < step.minHours) continue
        if (step.onlyIfIncomplete && onboardingDone) continue
        if (sentSet.has(`${org.id}:${step.alertType}`)) continue

        // Fetch admin email for this org
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('org_id', org.id)
          .eq('role', 'dealer_admin')
          .maybeSingle()

        if (!adminProfile) continue

        const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
        const email = authUser?.user?.email
        if (!email) continue

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
        void sendNotificationEmail({
          to:         email,
          subject:    step.subject,
          html:       step.buildHtml(adminProfile.display_name, appUrl),
          org_id:     org.id,
          email_type: step.alertType,
        })

        await supabase.from('admin_alerts').insert({
          org_id:     org.id,
          alert_type: step.alertType,
          severity:   'info',
        })

        // Mark as sent so we don't send a later step in the same cron run
        sentSet.add(`${org.id}:${step.alertType}`)
        dealerFollowUpsSent++

        // Only fire the first eligible step per org per cron run
        break
      }
    }

    return { dealerFollowUpsSent }
  } catch (err) {
    console.error('[dealerFollowUps] unhandled error:', err)
    throw err
  }
}
