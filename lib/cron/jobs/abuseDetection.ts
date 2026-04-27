/**
 * Runtime abuse detection — runs daily inside check-tasks.
 *
 * Checks:
 * 1. SMS velocity spike: >100 outbound SMS in last 24h for a single org
 * 2. Voice call spike: >30 outbound calls in last 24h for a single org
 * 3. New-org resource burn: trial orgs (<14 days old) with >50 SMS in 24h
 *
 * Writes to abuse_flags with dedup (one flag per org per type per day).
 * Platform admins review abuse_flags in the admin panel.
 */

import type { createServiceClient } from '@/lib/supabase/service'

const SMS_DAILY_SPIKE    = 100  // outbound texts per org per 24h
const VOICE_DAILY_SPIKE  = 30   // outbound calls per org per 24h
const NEW_ORG_SMS_LIMIT  = 50   // SMS threshold for orgs <14 days old
const NEW_ORG_AGE_DAYS   = 14

export async function runAbuseDetection(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ flagsCreated: number }> {
  let flagsCreated = 0

  try {
    const oneDayAgo   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const nowIso      = new Date().toISOString()

    // ── 1. SMS velocity per org in last 24h ───────────────────────────────────
    const { data: smsCounts } = await supabase
      .from('activities')
      .select('user_id')
      .eq('type', 'sms')
      .eq('direction', 'outbound')
      .gte('created_at', oneDayAgo)

    const smsByOrg = new Map<string, number>()
    for (const row of smsCounts ?? []) {
      smsByOrg.set(row.user_id, (smsByOrg.get(row.user_id) ?? 0) + 1)
    }

    for (const [orgId, count] of smsByOrg) {
      if (count < SMS_DAILY_SPIKE) continue
      const { error } = await supabase.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'sms_velocity_spike',
        severity:  count > SMS_DAILY_SPIKE * 2 ? 'critical' : 'high',
        details:   { sms_count_24h: count, threshold: SMS_DAILY_SPIKE, window: '24h', detected_at: nowIso },
      })
      if (!error) flagsCreated++
    }

    // ── 2. Voice call spike per org in last 24h ───────────────────────────────
    const { data: voiceCounts } = await supabase
      .from('voice_calls')
      .select('org_id')
      .gte('created_at', oneDayAgo)

    const voiceByOrg = new Map<string, number>()
    for (const row of voiceCounts ?? []) {
      if (!row.org_id) continue
      voiceByOrg.set(row.org_id, (voiceByOrg.get(row.org_id) ?? 0) + 1)
    }

    for (const [orgId, count] of voiceByOrg) {
      if (count < VOICE_DAILY_SPIKE) continue
      const { error } = await supabase.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'voice_call_spike',
        severity:  count > VOICE_DAILY_SPIKE * 2 ? 'critical' : 'high',
        details:   { call_count_24h: count, threshold: VOICE_DAILY_SPIKE, window: '24h', detected_at: nowIso },
      })
      if (!error) flagsCreated++
    }

    // ── 3. New org resource burn (trial accounts using a lot of SMS) ──────────
    const newOrgCutoff = new Date(Date.now() - NEW_ORG_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: newOrgs } = await supabase
      .from('organizations')
      .select('id')
      .gte('created_at', newOrgCutoff)
      .neq('id', '00000000-0000-0000-0000-000000000001')

    const newOrgIds = new Set((newOrgs ?? []).map(o => o.id))

    for (const [orgId, count] of smsByOrg) {
      if (!newOrgIds.has(orgId)) continue
      if (count < NEW_ORG_SMS_LIMIT) continue
      const { error } = await supabase.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'new_org_resource_burn',
        severity:  'high',
        details:   { sms_count_24h: count, threshold: NEW_ORG_SMS_LIMIT, org_age_days: `<${NEW_ORG_AGE_DAYS}`, detected_at: nowIso },
      })
      if (!error) flagsCreated++
    }
  } catch (e) {
    console.error('[abuseDetection] Error:', e)
  }

  return { flagsCreated }
}
