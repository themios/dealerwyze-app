/**
 * RealtyWyze onboarding follow-up sequence.
 *
 * D+1 (~24h after signup): day-one tips — fires once, regardless of onboarding status.
 * D+3 (~72h after signup): check-in — fires if onboarding still incomplete.
 * D+7 (~7d after signup):  re-engage  — fires if onboarding still incomplete.
 *
 * Each step is deduplicated via admin_alerts.alert_type so it fires exactly once per org.
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import {
  buildReDayOneTipsEmailHtml,
  buildReDayThreeFollowUpHtml,
  buildReDaySevenFollowUpHtml,
} from '@/lib/email/onboarding'
import type { createServiceClient } from '@/lib/supabase/service'

interface FollowUpStep {
  alertType:  string
  minHours:   number
  subject:    string
  buildHtml:  (name: string, appUrl: string) => string
  onlyIfIncomplete: boolean
}

const STEPS: FollowUpStep[] = [
  {
    alertType:        're_followup_d1',
    minHours:         20,
    subject:          '3 things to do first in RealtyWyze',
    buildHtml:        buildReDayOneTipsEmailHtml,
    onlyIfIncomplete: false,
  },
  {
    alertType:        're_followup_d3',
    minHours:         60,
    subject:          'How is setup going?',
    buildHtml:        buildReDayThreeFollowUpHtml,
    onlyIfIncomplete: true,
  },
  {
    alertType:        're_followup_d7',
    minHours:         156,
    subject:          'Still here for you',
    buildHtml:        buildReDaySevenFollowUpHtml,
    onlyIfIncomplete: true,
  },
]

export async function runReFollowUps(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ reFollowUpsSent: number }> {
  try {
    let reFollowUpsSent = 0
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .not('approved_at', 'is', null)
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .eq('vertical', 'real_estate')

    if (!orgs?.length) return { reFollowUpsSent }

    const orgIds = orgs.map(o => o.id)

    const { data: settings } = await supabase
      .from('org_settings')
      .select('org_id, onboarding_completed_at')
      .in('org_id', orgIds)

    const onboardingDoneSet = new Set(
      (settings ?? []).filter(s => s.onboarding_completed_at).map(s => s.org_id)
    )

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
      const orgAgeHours = (now - new Date(org.created_at).getTime()) / 3600000
      const onboardingDone = onboardingDoneSet.has(org.id)

      for (const step of STEPS) {
        if (orgAgeHours < step.minHours) continue
        if (step.onlyIfIncomplete && onboardingDone) continue
        if (sentSet.has(`${org.id}:${step.alertType}`)) continue

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

        sentSet.add(`${org.id}:${step.alertType}`)
        reFollowUpsSent++
        break
      }
    }

    return { reFollowUpsSent }
  } catch (err) {
    console.error('[reFollowUps] unhandled error:', err)
    throw err
  }
}
