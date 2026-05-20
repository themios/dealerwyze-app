/**
 * Dealer Success Inbox automation — activation (no leads 48h+) and trial ending (≤3 days).
 * Dedup via admin_alerts before creating threads. Per-org failures never abort the loop.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getDealerSignupEmail } from '@/lib/admin/dealerSignupEmail'
import { sendNotificationEmail } from '@/lib/email/notify'
import { writeAuditLog } from '@/lib/audit/log'
import { INBOX_TEMPLATES } from '@/lib/dealer-inbox/templates'

const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

function emailHtml(body: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')
  return `<div style="font-family: sans-serif; line-height: 1.5;">${safe}</div>`
}

async function hasOpenThread(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  threadType: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('dealer_threads')
    .select('id')
    .eq('org_id', orgId)
    .eq('thread_type', threadType)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()
  return !!data
}

async function hasDedupAlert(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  alertType: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('admin_alerts')
    .select('id')
    .eq('org_id', orgId)
    .eq('alert_type', alertType)
    .maybeSingle()
  return !!data
}

async function countCustomers(supabase: ReturnType<typeof createServiceClient>, orgId: string): Promise<number> {
  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
  return count ?? 0
}

async function countCustomers30d(supabase: ReturnType<typeof createServiceClient>, orgId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .gte('created_at', since)
  return count ?? 0
}

type InboxTemplate = (typeof INBOX_TEMPLATES)[keyof typeof INBOX_TEMPLATES]

type RunOpts = {
  orgId: string
  template: InboxTemplate
  alertType: string
  threadType: 'success' | 'billing'
  taskTitle: string
  dueAt: string
  rule: 'activation' | 'trial_ending'
}

async function runRuleForOrg(
  supabase: ReturnType<typeof createServiceClient>,
  opts: RunOpts,
): Promise<'triggered' | 'skipped'> {
  if (await hasDedupAlert(supabase, opts.orgId, opts.alertType)) return 'skipped'
  if (await hasOpenThread(supabase, opts.orgId, opts.threadType)) return 'skipped'

  const { error: alertErr } = await supabase.from('admin_alerts').insert({
    org_id:     opts.orgId,
    alert_type: opts.alertType,
    severity:   'info',
  })
  if (alertErr) return 'skipped'

  const { data: thread, error: threadErr } = await supabase
    .from('dealer_threads')
    .insert({
      org_id:      opts.orgId,
      subject:     opts.template.subject,
      thread_type: opts.threadType,
      status:      'open',
      created_by:  null,
    })
    .select('id')
    .single()

  if (threadErr || !thread) throw new Error('thread insert failed')

  const replyDomain = process.env.RESEND_REPLY_DOMAIN
  const { data: message, error: msgErr } = await supabase
    .from('dealer_messages')
    .insert({
      thread_id:   thread.id,
      org_id:      opts.orgId,
      sender_type: 'platform',
      sender_id:   null,
      channel:     'email',
      subject:     opts.template.subject,
      body:        opts.template.body,
    })
    .select('id')
    .single()

  if (msgErr || !message) throw new Error('message insert failed')

  const dealerEmail = await getDealerSignupEmail(supabase, opts.orgId)
  if (dealerEmail) {
    void sendNotificationEmail({
      to:         dealerEmail,
      subject:    opts.template.subject,
      html:       emailHtml(opts.template.body),
      org_id:     opts.orgId,
      email_type: 'dealer_inbox',
      ...(replyDomain ? { reply_to: `reply+${thread.id}@${replyDomain}` } : {}),
    })
  } else {
    console.warn('[dealerInboxAutomations] no dealer email for org', opts.orgId)
  }

  await supabase.from('dealer_tasks').insert({
    org_id:      opts.orgId,
    thread_id:   thread.id,
    title:       opts.taskTitle,
    due_at:      opts.dueAt,
    created_by:  null,
  })

  void writeAuditLog({
    orgId:      opts.orgId,
    actorId:    null,
    actorType:  'staff',
    action:     'dealer_inbox_automation_triggered',
    entityType: 'dealer_thread',
    entityId:   thread.id,
    metadata:   { rule: opts.rule, org_id: opts.orgId },
  })

  return 'triggered'
}

export async function runDealerInboxAutomations(): Promise<{ triggered: number; skipped: number }> {
  const supabase = createServiceClient()
  let triggered = 0
  let skipped = 0

  const fortyEightHAgo = new Date(Date.now() - 48 * 3600000).toISOString()
  const threeDaysOut = new Date(Date.now() + 3 * 86400000).toISOString()
  const nowIso = new Date().toISOString()

  try {
    const { data: activationOrgs } = await supabase
      .from('organizations')
      .select('id')
      .in('plan', ['trial', 'active'])
      .not('subscription_status', 'eq', 'canceled')
      .not('subscription_status', 'eq', 'unpaid')
      .is('suspended_at', null)
      .lte('created_at', fortyEightHAgo)
      .not('approved_at', 'is', null)
      .neq('id', SENTINEL_ORG_ID)

    for (const org of activationOrgs ?? []) {
      try {
        const leadCount = await countCustomers(supabase, org.id)
        if (leadCount > 0) { skipped++; continue }

        const result = await runRuleForOrg(supabase, {
          orgId:      org.id,
          template:   INBOX_TEMPLATES.activation,
          alertType:  'dealer_inbox_activation_thread',
          threadType: 'success',
          taskTitle:  'Follow up on activation thread',
          dueAt:      new Date(Date.now() + 3 * 86400000).toISOString(),
          rule:       'activation',
        })
        if (result === 'triggered') triggered++
        else skipped++
      } catch (err) {
        console.error('[dealerInboxAutomations] activation org', org.id, err)
        skipped++
      }
    }

    const { data: trialOrgs } = await supabase
      .from('organizations')
      .select('id, trial_ends_at')
      .eq('plan', 'trial')
      .eq('subscription_status', 'trialing')
      .is('suspended_at', null)
      .not('trial_ends_at', 'is', null)
      .lte('trial_ends_at', threeDaysOut)
      .gt('trial_ends_at', nowIso)
      .not('approved_at', 'is', null)
      .neq('id', SENTINEL_ORG_ID)

    for (const org of trialOrgs ?? []) {
      try {
        const leads30d = await countCustomers30d(supabase, org.id)
        if (leads30d >= 3) { skipped++; continue }

        const trialEnd = new Date(org.trial_ends_at!)
        const dueAt = new Date(trialEnd.getTime() - 86400000).toISOString()

        const result = await runRuleForOrg(supabase, {
          orgId:      org.id,
          template:   INBOX_TEMPLATES.trialEnding,
          alertType:  'dealer_inbox_trial_billing_task',
          threadType: 'billing',
          taskTitle:  'Trial ending — reach out about conversion',
          dueAt,
          rule:       'trial_ending',
        })
        if (result === 'triggered') triggered++
        else skipped++
      } catch (err) {
        console.error('[dealerInboxAutomations] trial org', org.id, err)
        skipped++
      }
    }
  } catch (err) {
    console.error('[dealerInboxAutomations] unhandled error:', err)
    throw err
  }

  return { triggered, skipped }
}
