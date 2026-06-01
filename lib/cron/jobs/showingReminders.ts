/**
 * lib/cron/jobs/showingReminders.ts
 *
 * RealtyWyze showing request reminders — notifies agents 24 hours before confirmed showings
 * Window: 22–26 hours from now
 * Idempotent: only sends if reminder_sent_at IS NULL
 * Queries showing_requests table (buyer inquiries), not showings table (dealer appointments)
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runShowingReminders(
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ remindersQueued: number }> {
  const windowStart = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

  // Query showing_requests table (RealtyWyze buyer inquiry showings)
  const { data: requests, error } = await supabase
    .from('showing_requests')
    .select(`
      id, confirmed_time, org_id, agent_id, buyer_name,
      listing:vehicles(address_line1, city, state, zip)
    `)
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .gte('confirmed_time', windowStart)
    .lte('confirmed_time', windowEnd)
    .limit(500)

  if (error) {
    console.error('[showingReminders] Query error:', error)
    return { remindersQueued: 0 }
  }

  let remindersQueued = 0

  for (const request of requests ?? []) {
    if (!request.agent_id) continue

    // Resolve agent display name and email
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .eq('id', request.agent_id)
      .maybeSingle()

    const agentEmail = agentProfile?.email
    if (!agentEmail) {
      console.warn(`[showingReminders] Agent ${request.agent_id} has no email`)
      continue
    }

    // Format listing address
    const listing = Array.isArray(request.listing) ? request.listing[0] : request.listing
    const address = listing
      ? [listing.address_line1, listing.city, listing.state, listing.zip]
          .filter(Boolean)
          .join(', ')
      : 'Property'

    // Send reminder email
    const agentName = agentProfile?.display_name || 'Agent'
    const subject = `Showing reminder: ${address}`
    const html = `
      <p>Hi ${agentName},</p>
      <p>You have a showing scheduled in about 24 hours.</p>
      <p><strong>${address}</strong></p>
      <p>Buyer: ${request.buyer_name}</p>
      <p>Be on time!</p>
    `

    await sendNotificationEmail({
      to: agentEmail,
      subject,
      html,
    }).catch(() => {
      console.error(
        `[showingReminders] Failed to send reminder for request ${request.id}`
      )
    })

    // Mark reminder sent in DB
    await supabase
      .from('showing_requests')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', request.id)
    remindersQueued++
  }

  console.log(`[showingReminders] Queued ${remindersQueued} reminders`)
  return { remindersQueued }
}
