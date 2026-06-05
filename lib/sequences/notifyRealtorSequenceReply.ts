/**
 * Notify the assigned agent when a customer replies and the autoresponder pauses.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '@/lib/email/notify'

export async function notifyRealtorSequenceReply({
  supabase,
  orgId,
  customerId,
  customerName,
  channel,
}: {
  supabase: SupabaseClient
  orgId: string
  customerId: string
  customerName: string
  channel: 'email' | 'sms'
}): Promise<void> {
  const { data: customer } = await supabase
    .from('customers')
    .select('assigned_to')
    .eq('id', customerId)
    .eq('user_id', orgId)
    .maybeSingle()

  const assigneeId = customer?.assigned_to as string | null | undefined
  if (!assigneeId) return

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from('profiles').select('email, display_name').eq('id', assigneeId).maybeSingle(),
    supabase.from('organizations').select('vertical').eq('id', orgId).maybeSingle(),
  ])

  const to = profile?.email?.trim()
  if (!to) return

  const appHost =
    process.env.REALTYWYZE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://app.dealerwyze.com'
  const link = `${appHost.replace(/\/$/, '')}/customers/${customerId}`
  const channelLabel = channel === 'email' ? 'email' : 'text'
  const agentName = profile?.display_name ?? 'there'
  const firstName = customerName.split(' ')[0] || customerName

  await sendNotificationEmail({
    to,
    subject: `${firstName} replied — autoresponder paused`,
    html: `<p>Hi ${agentName},</p>
<p><strong>${customerName}</strong> just replied by ${channelLabel}. Their email autoresponder has been <strong>paused</strong> so you can take over personally.</p>
<p><a href="${link}">Open contact in CRM</a></p>
<p>You can resume the same campaign from the contact page when you are ready.</p>`,
    org_id: orgId,
    email_type: 'sequence_reply_takeover',
    vertical: org?.vertical === 'real_estate' ? 'real_estate' : 'dealer',
  })
}
