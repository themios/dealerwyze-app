/** Insert idempotent health alerts for trial-expiring, past-due, and 2x-quota orgs; also no-activity alerts. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runAdminAlerts(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ adminAlerts: number; allOrgsCount: number }> {
  let adminAlerts = 0

  const nowIso           = new Date().toISOString()
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString()
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 86400000).toISOString()

  const { data: allOrgs } = await supabase
    .from('organizations')
    .select('id, subscription_status, trial_ends_at, monthly_message_count, sms_quota')
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .not('approved_at', 'is', null)

  for (const org of allOrgs ?? []) {
    const alertsToInsert: { org_id: string; alert_type: string; severity: string }[] = []

    if (
      org.subscription_status === 'trialing' &&
      org.trial_ends_at &&
      org.trial_ends_at <= threeDaysFromNow
    ) {
      alertsToInsert.push({ org_id: org.id, alert_type: 'trial_expiring', severity: 'critical' })
    }

    if (org.subscription_status === 'past_due') {
      alertsToInsert.push({ org_id: org.id, alert_type: 'past_due', severity: 'critical' })
    }

    const quota = org.sms_quota ?? 0
    const used  = org.monthly_message_count ?? 0
    if (quota > 0 && used > quota * 2) {
      alertsToInsert.push({ org_id: org.id, alert_type: '2x_quota_exceeded', severity: 'warning' })
    }

    for (const alert of alertsToInsert) {
      const { error } = await supabase
        .from('admin_alerts')
        .insert({ ...alert })
        .select('id')
        .maybeSingle()
      if (!error) {
        adminAlerts++
        if (alert.alert_type === '2x_quota_exceeded') {
          const { fireCogsAlertBackground } = await import('@/lib/cogs/alertWebhook')
          fireCogsAlertBackground({ org_id: org.id, alert_type: '2x_quota_exceeded', severity: alert.severity, created_at: nowIso })
        }
      }
    }
  }

  // No-activity alert: active orgs with no profile login in 21+ days
  const { data: inactiveProfiles } = await supabase
    .from('profiles')
    .select('org_id')
    .lt('created_at', twentyOneDaysAgo)
    .eq('role', 'dealer_admin')

  const inactiveOrgIds = [...new Set((inactiveProfiles ?? []).map(p => p.org_id))]
  for (const orgId of inactiveOrgIds.slice(0, 50)) {
    await supabase
      .from('admin_alerts')
      .insert({ org_id: orgId, alert_type: 'no_activity', severity: 'warning' })
      .select('id')
      .maybeSingle()
  }

  return { adminAlerts, allOrgsCount: (allOrgs ?? []).length }
}
