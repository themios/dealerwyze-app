import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { orgTodayActionLimiter } from '@/lib/rateLimit/upstash'

const actionSchema = z.object({
  activityId: z.string().uuid(),
  action: z.enum(['park', 'trust_sequence', 'low_roi', 'snooze', 'take_over', 'work_now', 'archive', 'restart']),
  snoozedUntil: z.string().datetime().optional(),
})

function defaultParkUntil(): string {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(8, 0, 0, 0)
  return next.toISOString()
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const rate = await orgTodayActionLimiter(profile.org_id)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many actions. Please try again in a moment.' }, { status: 429 })
  }

  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { activityId, action, snoozedUntil } = parsed.data
  if (action === 'snooze') {
    if (!snoozedUntil || new Date(snoozedUntil).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Snooze time must be in the future.' }, { status: 400 })
    }
  }

  const supabase = await createClient()
  const { data: activity } = await supabase
    .from('activities')
    .select('id, user_id, customer_id, today_section_override, today_park_until')
    .eq('id', activityId)
    .maybeSingle()

  if (!activity) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (activity.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = {}
  let section: 'replied' | 'human_now' | 'ai_handling' | 'follow_up_later' | 'low_roi' | null = null

  switch (action) {
    case 'park':
      updates.today_section_override = 'follow_up_later'
      updates.today_park_until = defaultParkUntil()
      section = 'follow_up_later'
      break
    case 'snooze':
      updates.today_section_override = 'follow_up_later'
      updates.today_park_until = snoozedUntil ?? null
      updates.snoozed_until = snoozedUntil ?? null
      section = 'follow_up_later'
      break
    case 'low_roi':
      updates.today_section_override = 'low_roi'
      updates.today_park_until = null
      section = 'low_roi'
      break
    case 'trust_sequence':
      updates.today_section_override = 'ai_handling'
      updates.today_park_until = null
      updates.snoozed_until = null
      section = 'ai_handling'
      break
    case 'take_over':
      updates.today_section_override = 'human_now'
      updates.today_park_until = null
      section = 'human_now'
      break
    case 'work_now':
    case 'restart':
      updates.today_section_override = null
      updates.today_park_until = null
      updates.snoozed_until = null
      section = null
      break
    case 'archive':
      updates.completed_at = nowIso
      updates.today_section_override = null
      updates.today_park_until = null
      section = null
      break
  }

  const { error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', activityId)
    .eq('user_id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update Today state.' }, { status: 500 })
  }

  if (activity.customer_id && (action === 'take_over' || action === 'trust_sequence')) {
    const status = action === 'take_over' ? 'paused' : 'active'
    const seqUpdates: Record<string, unknown> =
      action === 'take_over'
        ? { status, stop_reason: 'manual', stopped_at: nowIso }
        : { status, stop_reason: null, stopped_at: null }

    await supabase
      .from('customer_sequences')
      .update(seqUpdates)
      .eq('org_id', profile.org_id)
      .eq('customer_id', activity.customer_id)
      .in('status', action === 'take_over' ? ['active'] : ['paused'])
  }

  return NextResponse.json({ ok: true, section })
}
