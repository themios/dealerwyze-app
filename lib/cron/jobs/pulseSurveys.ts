/** Deliver day-30 and day-180 follow-up pulse surveys to customers sold within the target window. */

import { deliverPulseSurvey } from '@/lib/pulse/deliver'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runPulseSurveys(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  try {
    const { data: pulseOrgs } = await supabase
      .from('org_settings')
      .select('org_id, pulse_send_day30, pulse_send_day180')
      .eq('pulse_enabled', true)

    if (!pulseOrgs || pulseOrgs.length === 0) return

    const now = new Date()

    for (const os of pulseOrgs) {
      if (os.pulse_send_day30) {
        const from30 = new Date(now.getTime() - 30.5 * 24 * 60 * 60 * 1000).toISOString()
        const to30   = new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString()
        const { data: vehicles30 } = await supabase
          .from('vehicles')
          .select('sold_to_customer_id')
          .eq('user_id', os.org_id)
          .eq('status', 'sold')
          .gte('sold_at', from30)
          .lte('sold_at', to30)
          .not('sold_to_customer_id', 'is', null)

        for (const v of vehicles30 ?? []) {
          if (!v.sold_to_customer_id) continue
          deliverPulseSurvey({
            orgId:       os.org_id,
            customerId:  v.sold_to_customer_id,
            triggerType: 'day30',
          }).catch(() => {})
        }
      }

      if (os.pulse_send_day180) {
        const from180 = new Date(now.getTime() - 180.5 * 24 * 60 * 60 * 1000).toISOString()
        const to180   = new Date(now.getTime() - 179.5 * 24 * 60 * 60 * 1000).toISOString()
        const { data: vehicles180 } = await supabase
          .from('vehicles')
          .select('sold_to_customer_id')
          .eq('user_id', os.org_id)
          .eq('status', 'sold')
          .gte('sold_at', from180)
          .lte('sold_at', to180)
          .not('sold_to_customer_id', 'is', null)

        for (const v of vehicles180 ?? []) {
          if (!v.sold_to_customer_id) continue
          deliverPulseSurvey({
            orgId:       os.org_id,
            customerId:  v.sold_to_customer_id,
            triggerType: 'day180',
          }).catch(() => {})
        }
      }
    }
  } catch (e) {
    console.error('[cron/check-tasks] pulse triggers failed:', e)
  }
}
