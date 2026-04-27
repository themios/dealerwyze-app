/**
 * Account lifecycle management job.
 *
 * Runs daily. Handles:
 * 1. Trial expiry  — moves orgs to grace period (past_due_since) after 30 days
 * 2. Grace expiry  — downgrades to free tier after 7-day grace
 * 3. Suspension    — suspends orgs that have been free for 90 days with no upgrade
 * 4. Warning emails — weekly warnings at 7-day intervals while in grace period
 *
 * Orgs with an active Stripe subscription are never touched here.
 * Tim reviews suspended orgs manually before hard-delete.
 */

import type { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

function billingUrl(): string {
  return `${APP_URL}/settings/billing`
}

function warnHtml(displayName: string, daysLeft: number, headline: string, body: string): string {
  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin:0 0 12px;">Hi ${displayName},</h2>
  <p style="margin:0 0 16px;font-size:15px;">${body}</p>
  ${daysLeft > 0 ? `<p style="font-size:15px;margin:0 0 20px;">You have <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong> before your account is downgraded to the free tier.</p>` : ''}
  <a href="${billingUrl()}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Go to Billing Settings</a>
  <p style="font-size:12px;color:#666;margin-top:24px;">If you have questions, reply to this email and we will help.</p>
</div>`
}

export async function runAccountLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ processed: number }> {
  let processed = 0
  const now = new Date()
  const nowIso = now.toISOString()

  try {
    // ── 1. Move expired trials to grace period ────────────────────────────────
    // Orgs where trial_ends_at is past and not yet in grace (past_due_since is null)
    // and subscription_status is NOT 'active' (paying customers are exempt).
    const { data: expiredTrials } = await supabase
      .from('organizations')
      .select('id, name, subscription_status, trial_ends_at')
      .eq('subscription_status', 'free')
      .is('past_due_since', null)
      .is('suspended_at', null)
      .not('trial_ends_at', 'is', null)
      .lt('trial_ends_at', nowIso)
      .limit(200)

    for (const org of expiredTrials ?? []) {
      await supabase
        .from('organizations')
        .update({ past_due_since: nowIso })
        .eq('id', org.id)
      processed++
    }

    // ── 2. Downgrade to free tier after 7-day grace ───────────────────────────
    const graceCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: graceExpired } = await supabase
      .from('organizations')
      .select('id')
      .not('past_due_since', 'is', null)
      .lt('past_due_since', graceCutoff)
      .is('free_tier_since', null)
      .is('suspended_at', null)
      .limit(200)

    for (const org of graceExpired ?? []) {
      await supabase
        .from('organizations')
        .update({ plan: 'free', free_tier_since: nowIso, past_due_since: null })
        .eq('id', org.id)
      processed++
    }

    // ── 3. Suspend orgs on free tier for 90+ days with no upgrade ────────────
    const suspendCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: toSuspend } = await supabase
      .from('organizations')
      .select('id')
      .eq('plan', 'free')
      .not('free_tier_since', 'is', null)
      .lt('free_tier_since', suspendCutoff)
      .is('suspended_at', null)
      .limit(200)

    for (const org of toSuspend ?? []) {
      await supabase
        .from('organizations')
        .update({ suspended_at: nowIso })
        .eq('id', org.id)
      processed++
    }

    // ── 4. Grace period warning emails (weekly) ───────────────────────────────
    // Find orgs currently in grace (past_due_since set, no free_tier_since yet).
    const { data: inGrace } = await supabase
      .from('organizations')
      .select('id, name, past_due_since, lifecycle_warnings')
      .not('past_due_since', 'is', null)
      .is('free_tier_since', null)
      .is('suspended_at', null)
      .limit(200)

    for (const org of inGrace ?? []) {
      const pastDueSince = new Date(org.past_due_since as string)
      const daysInGrace  = Math.floor((now.getTime() - pastDueSince.getTime()) / 86400000)

      // Send at day 1, 4, and 7 (covers the 7-day grace window)
      const sendOnDay = [1, 4, 7].find(d => daysInGrace >= d)
      if (!sendOnDay) continue

      const warningKey = `grace_day_${sendOnDay}`
      const warnings   = (org.lifecycle_warnings as string[] | null) ?? []
      if (warnings.includes(warningKey)) continue // already sent

      // Get the admin profile email
      const { data: admin } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('org_id', org.id)
        .eq('role', 'dealer_admin')
        .limit(1)
        .maybeSingle()

      if (!admin) continue

      const { data: authUser } = await supabase.auth.admin.getUserById(admin.id)
      const email = authUser.user?.email
      if (!email) continue

      const daysLeft = Math.max(0, 7 - daysInGrace)
      await sendNotificationEmail({
        to:      email,
        subject: `Action needed: your DealerWyze trial has ended`,
        html: warnHtml(
          admin.display_name ?? 'there',
          daysLeft,
          'Your trial has ended',
          `Your DealerWyze trial period has ended. To keep all your features - including texting, the voice agent, and automated sequences - you need to add a payment method.`,
        ),
      })

      // Record warning to prevent duplicates
      await supabase.rpc('append_lifecycle_warning', {
        org_id:  org.id,
        warning: warningKey,
      })

      processed++
    }
  } catch (e) {
    console.error('[account-lifecycle] Error:', e)
  }

  return { processed }
}
