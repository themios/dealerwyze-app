/**
 * Weekly Monday morning SaaS health summary for the platform owner.
 * Collects the past 7 days of key metrics, asks Claude to write a plain-English
 * summary, then sends the full email to PLATFORM_OWNER_EMAIL.
 *
 * Triggered by /api/cron/weekly-summary on Mondays at 5pm UTC (9am PT).
 */

import 'server-only'
import { aiComplete, AI_MODEL } from '@/lib/ai/client'
import { sendNotificationEmail } from '@/lib/email/notify'
import { computeAttritionScore } from '@/lib/admin/attrition'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runWeeklyOwnerSummary(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ sent: boolean }> {
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
  if (!ownerEmail) return { sent: false }

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
  const now     = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString()
  const today   = new Date().toISOString().slice(0, 10)

  // ── Gather metrics ──────────────────────────────────────────────────────────

  // All approved non-sentinel orgs
  const { data: allOrgs } = await supabase
    .from('organizations')
    .select(`
      id, name, subscription_status, created_at, last_active_at,
      trial_ends_at, current_period_end,
      org_settings ( onboarding_completed_at, monthly_message_count, sms_quota )
    `)
    .not('approved_at', 'is', null)
    .neq('id', '00000000-0000-0000-0000-000000000001')

  const orgs = allOrgs ?? []

  // New signups this week
  const newSignups = orgs.filter(o => o.created_at >= sevenDaysAgo)

  // Subscription breakdown
  const subCounts: Record<string, number> = {}
  for (const o of orgs) {
    const s = o.subscription_status ?? 'unknown'
    subCounts[s] = (subCounts[s] ?? 0) + 1
  }

  // Onboarding completion rate
  const settingsMap = new Map(
    orgs.map(o => {
      const s = Array.isArray(o.org_settings) ? o.org_settings[0] : o.org_settings
      return [o.id, s]
    })
  )
  const onboardingDone  = orgs.filter(o => settingsMap.get(o.id)?.onboarding_completed_at).length
  const onboardingTotal = orgs.length
  const completionPct   = onboardingTotal > 0
    ? Math.round((onboardingDone / onboardingTotal) * 100)
    : 0

  // Active last 7 days
  const activeLastWeek = orgs.filter(o => o.last_active_at && o.last_active_at >= sevenDaysAgo).length

  // Inactive 7+ days (but not brand new)
  const inactiveOrgs = orgs.filter(o => {
    if (o.created_at >= sevenDaysAgo) return false  // too new to flag
    if (!o.last_active_at) return true
    return o.last_active_at < sevenDaysAgo
  })

  // Attrition scoring
  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('org_id, status')

  const emailMap = new Map<string, boolean>()
  for (const ea of emailAccounts ?? []) {
    if (ea.status === 'active') emailMap.set(ea.org_id, true)
  }

  let criticalCount = 0
  let atRiskCount   = 0
  const atRiskList: { name: string; score: number; signals: string }[] = []

  for (const org of orgs) {
    const settings    = settingsMap.get(org.id)
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

    if (tier === 'critical') criticalCount++
    if (tier === 'at_risk')  atRiskCount++

    if (tier === 'critical' || tier === 'at_risk') {
      atRiskList.push({
        name:    org.name,
        score,
        signals: signals.filter(s => s.delta < 0).map(s => s.label).join(', '),
      })
    }
  }

  atRiskList.sort((a, b) => a.score - b.score)

  // ── Build data snapshot for AI prompt ──────────────────────────────────────

  const snapshot = {
    reportDate:      today,
    totalOrgs:       orgs.length,
    subscriptions:   subCounts,
    newSignupsWeek:  newSignups.length,
    newSignupNames:  newSignups.map(o => o.name),
    activeLastWeek,
    inactiveCount:   inactiveOrgs.length,
    inactiveNames:   inactiveOrgs.slice(0, 10).map(o => o.name),
    onboardingDone,
    onboardingTotal,
    completionPct,
    criticalCount,
    atRiskCount,
    atRiskList:      atRiskList.slice(0, 10),
  }

  // ── Ask Claude for a plain-English narrative summary ───────────────────────

  let aiNarrative = ''

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const msg = await aiComplete({
        model:      AI_MODEL,
        max_tokens: 600,
        messages: [{
          role:    'user',
          content: `You are a SaaS business advisor writing a concise weekly briefing for the platform founder.
Write 3-4 short paragraphs in plain English. No em dashes. No bullet points in the narrative. No jargon.
Focus on: overall momentum, what needs immediate attention, and one concrete recommendation for the week.
Be direct and honest - this is the founder reading about their own business.

Here is the data snapshot for this week:
${JSON.stringify(snapshot, null, 2)}`,
        }],
      })
      const text = msg.choices[0]?.message?.content
      if (text) aiNarrative = text
    } catch (err) {
      console.error('[weeklyOwnerSummary] AI narrative failed:', err)
    }
  }

  // ── Build email HTML ────────────────────────────────────────────────────────

  const subBreakdownHtml = Object.entries(subCounts)
    .map(([status, count]) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#64748B;text-transform:capitalize">${status.replace('_', ' ')}</td>
      <td style="padding:6px 0;font-size:13px;color:#374151;font-weight:700;text-align:right">${count}</td>
    </tr>`).join('')

  const newSignupRows = newSignups.length
    ? newSignups.map(o => `<li style="font-size:13px;color:#374151;padding:2px 0">${o.name}</li>`).join('')
    : '<li style="font-size:13px;color:#94A3B8">No new signups this week</li>'

  const atRiskRows = atRiskList.slice(0, 8).map(r => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;vertical-align:top">
        <strong>${r.name}</strong>
        <span style="color:#DC2626;font-size:11px;margin-left:6px">score ${r.score}</span>
        ${r.signals ? `<br><span style="font-size:11px;color:#94A3B8">${r.signals}</span>` : ''}
      </td>
    </tr>`).join('')

  const aiSection = aiNarrative ? `
    <div style="background:#F0F7FF;border-radius:10px;padding:20px 24px;margin:0 0 28px">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">AI Summary</p>
      <div style="font-size:14px;color:#374151;line-height:1.8;white-space:pre-wrap">${aiNarrative}</div>
    </div>` : ''

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:24px 16px">
  <tr><td>

    <!-- Header -->
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze Weekly</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:22px;font-weight:700;line-height:1.3">
        Monday morning briefing
      </h1>
      <p style="margin:6px 0 0;color:#94A3B8;font-size:12px">Week ending ${today}</p>
    </div>

    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">

      <!-- AI narrative -->
      ${aiSection}

      <!-- At-a-glance stats -->
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">At a glance</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        <tr>
          <td style="width:50%;padding:0 8px 0 0;vertical-align:top">
            <div style="background:#F8FAFC;border-radius:8px;padding:16px;text-align:center">
              <p style="margin:0;font-size:28px;font-weight:800;color:#0D2B55">${orgs.length}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748B;text-transform:uppercase">Total orgs</p>
            </div>
          </td>
          <td style="width:50%;padding:0 0 0 8px;vertical-align:top">
            <div style="background:#F8FAFC;border-radius:8px;padding:16px;text-align:center">
              <p style="margin:0;font-size:28px;font-weight:800;color:#16A34A">${newSignups.length}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748B;text-transform:uppercase">New this week</p>
            </div>
          </td>
        </tr>
        <tr><td colspan="2" style="height:12px"></td></tr>
        <tr>
          <td style="width:50%;padding:0 8px 0 0;vertical-align:top">
            <div style="background:#F8FAFC;border-radius:8px;padding:16px;text-align:center">
              <p style="margin:0;font-size:28px;font-weight:800;color:#F07018">${activeLastWeek}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748B;text-transform:uppercase">Active last 7d</p>
            </div>
          </td>
          <td style="width:50%;padding:0 0 0 8px;vertical-align:top">
            <div style="background:#F8FAFC;border-radius:8px;padding:16px;text-align:center">
              <p style="margin:0;font-size:28px;font-weight:800;color:${criticalCount > 0 ? '#DC2626' : '#374151'}">${criticalCount + atRiskCount}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748B;text-transform:uppercase">At-risk / critical</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- Subscription breakdown -->
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">Subscriptions</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${subBreakdownHtml}
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B;border-top:1px solid #F1F5F9">Onboarding complete</td>
          <td style="padding:6px 0;font-size:13px;font-weight:700;color:#374151;text-align:right;border-top:1px solid #F1F5F9">${onboardingDone} / ${onboardingTotal} (${completionPct}%)</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B">Inactive 7+ days</td>
          <td style="padding:6px 0;font-size:13px;font-weight:700;color:${inactiveOrgs.length > 0 ? '#D97706' : '#374151'};text-align:right">${inactiveOrgs.length}</td>
        </tr>
      </table>

      <!-- New signups -->
      ${newSignups.length > 0 ? `
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">New signups this week</p>
      <ul style="margin:0 0 28px;padding-left:18px">
        ${newSignupRows}
      </ul>` : ''}

      <!-- Needs attention -->
      ${atRiskList.length > 0 ? `
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.05em">Needs attention</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${atRiskRows}
      </table>` : `
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:14px 18px;margin-bottom:28px">
        <p style="margin:0;font-size:13px;color:#15803D;font-weight:600">No at-risk orgs this week. Good shape.</p>
      </div>`}

      <div style="text-align:center">
        <a href="${appUrl}/admin/orgs"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none">
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
    subject: `DealerWyze weekly — ${newSignups.length} new signup${newSignups.length !== 1 ? 's' : ''}, ${criticalCount + atRiskCount} need attention`,
    html,
  })

  return { sent: true }
}
