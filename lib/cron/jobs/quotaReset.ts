/** Reset monthly SMS/MMS/fax/voice quotas for organizations whose billing cycle has expired. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runQuotaReset(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ quotasReset: number }> {
  let quotasReset = 0

  const today = new Date().toISOString().slice(0, 10)

  const { data: expiredOrgs } = await supabase
    .from('organizations')
    .select('id')
    .lt('billing_cycle_end', today)
    .not('billing_cycle_end', 'is', null)

  for (const org of expiredOrgs ?? []) {
    const cycleStart = today
    const cycleEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    await supabase
      .from('organizations')
      .update({
        monthly_message_count: 0,
        monthly_mms_count: 0,
        monthly_fax_pages: 0,
        sms_overage_count: 0,
        mms_overage_count: 0,
        voice_overage_minutes: 0,
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
      })
      .eq('id', org.id)

    await supabase
      .from('org_settings')
      .update({ voice_minutes_month: 0, voice_overage_notified_at: null })
      .eq('org_id', org.id)

    quotasReset++
  }

  return { quotasReset }
}
