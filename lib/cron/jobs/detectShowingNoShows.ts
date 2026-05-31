/**
 * Detect showings that likely resulted in no-shows.
 * 
 * Logic:
 * - Status = confirmed AND confirmed_time < now - 2 hours
 * - No feedback submitted yet (no row in showing_feedback)
 * - Create activity/reminder for agent to confirm attendance
 */
import { createServiceClient } from '@/lib/supabase/service'

export async function detectShowingNoShows() {
  const supabase = createServiceClient()
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  try {
    // Find confirmed showings that are 2+ hours past and have no feedback
    const { data: noShowCandidates } = await supabase
      .from('showing_requests')
      .select(`
        id, agent_id, listing_id, buyer_name, confirmed_time, org_id,
        showing_feedback:showing_feedback(id)
      `)
      .eq('status', 'confirmed')
      .lt('confirmed_time', twoHoursAgo.toISOString())
      .limit(100)

    if (!noShowCandidates || noShowCandidates.length === 0) {
      return { processed: 0 }
    }

    // Filter to those without feedback
    const actualNoShows = (noShowCandidates as any[]).filter(
      (sr) => !sr.showing_feedback || sr.showing_feedback.length === 0
    )

    console.log(`Found ${actualNoShows.length} potential no-shows`)

    // Create reminder activities for agents
    const reminders = actualNoShows.map((sr) => ({
      user_id: sr.org_id,
      agent_id: sr.agent_id,
      type: 'task' as const,
      body: `Confirm status of showing for ${sr.buyer_name} (was scheduled for ${new Date(sr.confirmed_time).toLocaleString()}). Mark as showed or no-show in feedback.`,
      priority: 'high' as const,
      completed_at: null,
    }))

    if (reminders.length > 0) {
      await supabase.from('activities').insert(reminders)
    }

    return { processed: actualNoShows.length }
  } catch (err) {
    console.error('Error detecting no-shows:', err)
    return { error: String(err) }
  }
}
