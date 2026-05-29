/**
 * Showing reminders — notifies agents via email ~24 hours before a scheduled showing.
 * Window: 22–26 hours from now (matches appointmentRemindersV2 pattern).
 * Idempotent: reminder_sent_at IS NULL guard prevents double-firing.
 *
 * SMS is omitted: org_settings has no agent phone column.
 * Agent email is resolved via supabase.auth.admin.getUserById(agent_id).
 * Covers SHOW-02.
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runShowingReminders(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ remindersQueued: number }> {
  const windowStart = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString()
  const windowEnd   = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

  const { data: showings } = await supabase
    .from('showings')
    .select(`
      id, scheduled_at, org_id, agent_id, listing_id,
      listing:vehicles(id, address),
      contact:customers(id, name)
    `)
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .limit(500)

  let remindersQueued = 0

  for (const showing of showings ?? []) {
    if (!showing.agent_id) continue

    // Resolve agent display name from profiles
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', showing.agent_id)
      .maybeSingle()

    // Resolve agent email from Supabase Auth (not stored on profiles)
    const { data: authUser } = await supabase.auth.admin.getUserById(showing.agent_id)
    const agentEmail = authUser?.user?.email
    if (!agentEmail) continue

    const listing = Array.isArray(showing.listing) ? showing.listing[0] : showing.listing
    const contact = Array.isArray(showing.contact) ? showing.contact[0] : showing.contact

    const scheduledAt = new Date(showing.scheduled_at).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
    })

    const address   = (listing as { address?: string } | null)?.address ?? 'Unknown address'
    const buyerName = (contact as { name?: string } | null)?.name ?? 'a buyer'
    const agentName = agentProfile?.display_name ?? 'Agent'

    // Email to agent — best-effort (failure logged, does not halt loop)
    await sendNotificationEmail({
      to:      agentEmail,
      subject: `Showing reminder: ${address}`,
      html:    `<p>Hi ${agentName},</p>
                <p>You have a showing scheduled for <strong>${scheduledAt}</strong> at <strong>${address}</strong> with ${buyerName}.</p>
                <p>This is your 24-hour reminder.</p>`,
      org_id:     showing.org_id,
      email_type: 'showing_reminder',
    }).catch(err => console.error('[showingReminders] email failed:', { showingId: showing.id, error: (err as Error).message }))

    // Stamp reminder_sent_at to prevent double-fire on re-runs
    await supabase
      .from('showings')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', showing.id)

    remindersQueued++
  }

  console.log(`[check-tasks] showing reminders queued: ${remindersQueued}`)
  return { remindersQueued }
}
