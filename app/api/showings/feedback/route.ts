/**
 * POST /api/showings/feedback
 * Agent submits post-showing feedback.
 * Marks showing as closed, captures buyer interest and notes.
 * Can trigger follow-up task creation if selected.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({
  showing_id: z.string().uuid(),
  showed: z.boolean(),
  buyer_interest: z.enum(['high', 'medium', 'low']).nullable().optional(),
  feedback: z.string().max(2000).nullable().optional(),
  follow_up_action: z
    .enum(['schedule_follow_up', 'send_details', 'wait_for_buyer', 'none'])
    .nullable()
    .optional(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  let body: z.infer<typeof Schema>
  try {
    const raw = await req.json()
    const parsed = Schema.safeParse(raw)
    if (!parsed.success) {
      console.error('Schema validation failed:', parsed.error.issues)
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { showing_id, showed, buyer_interest, feedback, follow_up_action } = body

  // Fetch the showing request (RLS enforces agent ownership)
  const { data: showing } = await supabase
    .from('showing_requests')
    .select('id, agent_id, listing_id, buyer_name, status')
    .eq('id', showing_id)
    .eq('agent_id', profile.id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json(
      { error: 'Showing request not found' },
      { status: 404 }
    )
  }

  // Determine showing status based on feedback
  const showingStatus = showed ? 'closed' : 'no_show'

  // Insert feedback record
  const { error: feedbackError } = await supabase
    .from('showing_feedback')
    .insert({
      org_id: profile.org_id,
      showing_request_id: showing.id,
      agent_id: profile.id,
      showed,
      buyer_interest: showed ? buyer_interest ?? null : null,
      feedback: feedback ?? null,
      follow_up_action: follow_up_action ?? null,
    })

  if (feedbackError) {
    console.error('Failed to insert feedback:', feedbackError)
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    )
  }

  // Update showing_request status
  const { error: updateError } = await supabase
    .from('showing_requests')
    .update({ status: showingStatus })
    .eq('id', showing.id)

  if (updateError) {
    console.error('Failed to update showing:', updateError)
    return NextResponse.json(
      { error: 'Failed to update showing' },
      { status: 500 }
    )
  }

  // Create follow-up task if requested
  if (showed && follow_up_action === 'schedule_follow_up') {
    const followUpDue = new Date()
    followUpDue.setDate(followUpDue.getDate() + 3) // 3 days from now

    // Fire-and-forget follow-up task creation
    void supabase
      .from('activities')
      .insert({
        user_id: profile.org_id,
        type: 'task',
        body: `Follow up with ${showing.buyer_name} from showing (interested)`,
        priority: 'high',
        due_at: followUpDue.toISOString(),
      })
  }

  return NextResponse.json(
    { ok: true, status: showingStatus },
    { status: 200 }
  )
}
