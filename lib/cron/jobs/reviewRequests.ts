/** Process scheduled Google review request tasks, sending SMS and/or email to sold customers. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runReviewRequests(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ reviewRequestsSent: number }> {
  let reviewRequestsSent = 0

  try {
    const nowIso = new Date().toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

    const { data: dueTasks } = await supabase
      .from('tasks')
      .select('id, user_id, linked_customer_id')
      .eq('task_type', 'review_request')
      .eq('status', 'open')
      .lte('due_at', nowIso)
      .limit(100)

    for (const task of dueTasks ?? []) {
      if (!task.linked_customer_id || !task.user_id) continue
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, org_id, role')
          .eq('org_id', task.user_id)
          .eq('role', 'dealer_admin')
          .maybeSingle()

        if (!profile) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const { data: settings } = await supabase
          .from('org_settings')
          .select('business_name, google_review_url, review_request_enabled')
          .eq('org_id', task.user_id)
          .maybeSingle()

        if (!settings?.review_request_enabled || !settings.google_review_url) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const { data: customer } = await supabase
          .from('customers')
          .select('id, name, primary_phone, email, unsubscribe_sms, unsubscribe_email, user_id')
          .eq('id', task.linked_customer_id)
          .eq('user_id', task.user_id)
          .maybeSingle()

        if (!customer) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const { data: recent } = await supabase
          .from('activities')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('type', 'review_request')
          .gte('completed_at', since60)
          .maybeSingle()

        if (recent) {
          await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
          continue
        }

        const dealerName = settings.business_name || 'your dealership'
        const reviewUrl  = settings.google_review_url
        const firstName  = customer.name?.split(' ')[0] || 'there'

        let smsSent = false, emailSent = false

        if (customer.primary_phone && !customer.unsubscribe_sms) {
          const smsBody = `Hi ${firstName}, thank you for your recent purchase! We would really appreciate if you could share your experience - it helps other customers find us: ${reviewUrl}`
          const smsRes = await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: customer.primary_phone, body: smsBody, customer_id: customer.id, org_id: task.user_id }),
          })
          if (smsRes.ok) smsSent = true
        }

        if (customer.email && !customer.unsubscribe_email) {
          const emailBody = `Hi ${firstName},\n\nThank you for your recent purchase from ${dealerName}! We hope you are enjoying your vehicle.\n\nIf you have a moment, we would love to hear about your experience. Your review helps other customers find us:\n\n${reviewUrl}\n\nThank you!\n${dealerName}`
          const emailRes = await fetch(`${appUrl}/api/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customer.id,
              org_id: task.user_id,
              subject: `How was your experience at ${dealerName}?`,
              emailBody,
            }),
          })
          if (emailRes.ok) emailSent = true
        }

        if (smsSent || emailSent) {
          const channels = [smsSent && 'SMS', emailSent && 'email'].filter(Boolean).join(' + ')
          await supabase.from('activities').insert({
            user_id: customer.user_id,
            customer_id: customer.id,
            type: 'review_request',
            direction: 'outbound',
            body: `Google review request sent via ${channels}.`,
            completed_at: nowIso,
            priority: 'normal',
          })
          reviewRequestsSent++
        }

        await supabase.from('tasks').update({ status: 'done', completed_at: nowIso }).eq('id', task.id)
      } catch (e) {
        console.error('[check-tasks] Job 13 review request error for task', task.id, e)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 13 review requests error:', e)
  }

  return { reviewRequestsSent }
}
