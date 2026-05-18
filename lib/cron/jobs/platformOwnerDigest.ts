/**
 * Daily digest email to the platform owner (PLATFORM_OWNER_EMAIL).
 * Three sections:
 *   1. New signups in the last 48 hours
 *   2. Dealers going stale — completed onboarding but inactive 5+ days
 *   3. At-risk / critical orgs by attrition score
 *
 * Skipped entirely if PLATFORM_OWNER_EMAIL is not set or there is nothing to report.
 * Uses admin_alerts dedup (alert_type='owner_digest_sent') keyed to YYYY-MM-DD so it
 * fires at most once per calendar day regardless of how many times check-tasks runs.
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import { computeAttritionScore } from '@/lib/admin/attrition'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runPlatformOwnerDigest(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ platformDigestSent: boolean }> {
  try {
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
    if (!ownerEmail) return { platformDigestSent: false }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
    const today  = new Date().toISOString().slice(0, 10)

    // Dedup: skip if already sent today
    const { data: alreadySent } = await supabase
      .from('admin_alerts')
      .select('id')
      .eq('org_id', '00000000-0000-0000-0000-000000000001')
      .eq('alert_type', `owner_digest_sent:${today}`)
      .maybeSingle()
    if (alreadySent) return { platformDigestSent: false }

    const now            = Date.now()
    const fortyEightHAgo = new Date(now - 48 * 3600000).toISOString()
    const fiveDaysAgo    = new Date(now -  5 * 86400000).toISOString()

    // ── 1. New signups (last 48h) ─────────────────────────────────────────────
    const { data: newOrgs } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .not('approved_at', 'is', null)
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .gte('created_at', fortyEightHAgo)
      .order('created_at', { ascending: false })

    const newOrgRows: { name: string; email: string | null; phone: string | null; createdAt: string }[] = []

    for (const org of newOrgs ?? []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('org_id', org.id)
        .eq('role', 'dealer_admin')
        .maybeSingle()

      if (!profile) continue
      const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
      const email = authUser?.user?.email ?? null
      const phone = authUser?.user?.phone ?? null

      newOrgRows.push({
        name:      org.name,
        email,
        phone,
        createdAt: org.created_at,
      })
    }

    // ── 2. Going stale: onboarding done but no login in 5+ days ──────────────
    const { data: completedSettings } = await supabase
      .from('org_settings')
      .select('org_id, onboarding_completed_at')
      .not('onboarding_completed_at', 'is', null)

    const completedOrgIds = (completedSettings ?? []).map(s => s.org_id)

    const staleRows: { name: string; lastActive: string | null; daysSince: number }[] = []

    if (completedOrgIds.length > 0) {
      const { data: staleOrgs } = await supabase
        .from('organizations')
        .select('id, name, last_active_at')
        .in('id', completedOrgIds)
        .neq('id', '00000000-0000-0000-0000-000000000001')
        .not('approved_at', 'is', null)
        .or(`last_active_at.is.null,last_active_at.lt.${fiveDaysAgo}`)
        .limit(20)

      for (const org of staleOrgs ?? []) {
        const daysSince = org.last_active_at
          ? Math.floor((now - new Date(org.last_active_at).getTime()) / 86400000)
          : 999
        staleRows.push({ name: org.name, lastActive: org.last_active_at, daysSince })
      }
    }

    // ── 3. At-risk / critical orgs ────────────────────────────────────────────
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select(`
        id, name, subscription_status, trial_ends_at, current_period_end, last_active_at,
        org_settings ( monthly_message_count, sms_quota, onboarding_completed_at )
      `)
      .not('approved_at', 'is', null)
      .neq('id', '00000000-0000-0000-0000-000000000001')

    const { data: emailAccounts } = await supabase
      .from('email_accounts')
      .select('org_id, status')

    const emailMap = new Map<string, boolean>()
    for (const ea of emailAccounts ?? []) {
      if (ea.status === 'active') emailMap.set(ea.org_id, true)
    }

    const atRiskRows: { name: string; tier: string; score: number; signals: string }[] = []

    for (const org of allOrgs ?? []) {
      const settings    = Array.isArray(org.org_settings) ? org.org_settings[0] : org.org_settings
      const smsQuota    = settings?.sms_quota ?? 1
      const msgCount    = settings?.monthly_message_count ?? 0
      const smsUsedPct  = smsQuota > 0 ? Math.round((msgCount / smsQuota) * 100) : 0
      const trialDaysLeft = org.trial_ends_at
        ? Math.ceil((new Date(org.trial_ends_at).getTime() - now) / 86400000)
        : null
      const pastDueDays = org.subscription_status === 'past_due' && org.current_period_end
        ? Math.floor((now - new Date(org.current_period_end).getTime()) / 86400000)
        : 0

      const { score, tier, signals } = computeAttritionScore({
        subscription_status:   org.subscription_status,
        last_active_at:        org.last_active_at ?? null,
        has_active_email:      emailMap.get(org.id) ?? false,
        onboarding_done:       !!settings?.onboarding_completed_at,
        sms_used_pct:          smsUsedPct,
        monthly_message_count: msgCount,
        tickets_open:          0,
        past_due_days:         pastDueDays,
        trial_days_left:       trialDaysLeft,
      })

      if (tier === 'critical' || tier === 'at_risk') {
        atRiskRows.push({
          name:    org.name,
          tier,
          score,
          signals: signals.filter(s => s.delta < 0).map(s => s.label).join(', '),
        })
      }
    }

    atRiskRows.sort((a, b) => a.score - b.score)

    // Skip sending if there is nothing actionable
    if (!newOrgRows.length && !staleRows.length && !atRiskRows.length) {
      return { platformDigestSent: false }
    }

    // ── Build email ───────────────────────────────────────────────────────────
    const sectionNew = newOrgRows.length ? `
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
        New signups (${newOrgRows.length})
      </h3>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${newOrgRows.map(r => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;vertical-align:top">
            <strong>${r.name}</strong>
            ${r.email ? `&nbsp;<a href="mailto:${r.email}?subject=Welcome%20to%20DealerWyze%20-%20quick%20check%20in" style="color:#F07018;font-size:12px">email</a>` : ''}
            ${r.phone ? `&nbsp;<a href="sms:${r.phone}" style="color:#F07018;font-size:12px">text</a>` : ''}
            <span style="color:#94A3B8;font-size:11px;margin-left:8px">${new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </td>
        </tr>`).join('')}
      </table>` : ''

    const sectionStale = staleRows.length ? `
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
        Going stale — onboarded but inactive 5+ days (${staleRows.length})
      </h3>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${staleRows.map(r => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151">
            <strong>${r.name}</strong>
            <span style="color:#F07018;font-weight:600;margin-left:8px">${r.daysSince === 999 ? 'never logged in' : `${r.daysSince}d inactive`}</span>
          </td>
        </tr>`).join('')}
      </table>` : ''

    const tierColor = (tier: string) => tier === 'critical' ? '#DC2626' : '#D97706'

    const sectionAtRisk = atRiskRows.length ? `
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
        At-risk / critical orgs (${atRiskRows.length})
      </h3>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${atRiskRows.map(r => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;vertical-align:top">
            <strong>${r.name}</strong>
            <span style="color:${tierColor(r.tier)};font-weight:700;margin-left:6px;font-size:11px;text-transform:uppercase">${r.tier}</span>
            <span style="color:#94A3B8;font-size:11px;margin-left:4px">score ${r.score}</span>
            ${r.signals ? `<br><span style="font-size:11px;color:#64748B">${r.signals}</span>` : ''}
          </td>
        </tr>`).join('')}
      </table>` : ''

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:20px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze Admin</p>
      <h1 style="margin:6px 0 0;color:#FFFFFF;font-size:18px;font-weight:700">Daily dealer pulse — ${today}</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      ${sectionNew}
      ${sectionStale}
      ${sectionAtRisk}
      <div style="text-align:center;margin-top:8px">
        <a href="${appUrl}/admin/orgs"
           style="display:inline-block;background:#E2E8F0;color:#374151;font-weight:700;
                  font-size:13px;padding:10px 24px;border-radius:6px;text-decoration:none">
          Open Admin Panel
        </a>
      </div>
    </div>
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">DealerWyze Platform</div>
  </td></tr>
</table>
</body>
</html>`

    void sendNotificationEmail({
      to:      ownerEmail,
      subject: `DealerWyze daily pulse — ${newOrgRows.length} new, ${staleRows.length} stale, ${atRiskRows.length} at-risk`,
      html,
    })

    // Mark as sent for today using the sentinel org ID
    await supabase.from('admin_alerts').insert({
      org_id:     '00000000-0000-0000-0000-000000000001',
      alert_type: `owner_digest_sent:${today}`,
      severity:   'info',
    })

    return { platformDigestSent: true }
  } catch (err) {
    console.error('[platformOwnerDigest] unhandled error:', err)
    throw err
  }
}
