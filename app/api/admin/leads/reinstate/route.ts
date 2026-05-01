import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { canManagePerformance } from '@/lib/intelligence/performance'
import { createServiceClient } from '@/lib/supabase/service'

const bodySchema = z.object({
  auditId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManagePerformance(profile)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { auditId, reason } = parsed.data

  const { data: audit } = await supabase
    .from('lost_lead_audit')
    .select('id, org_id, activity_id, reinstated_at')
    .eq('id', auditId)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!audit) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  if (audit.reinstated_at) {
    return NextResponse.json({ error: 'Lead already reinstated.' }, { status: 409 })
  }
  if (!audit.activity_id) {
    return NextResponse.json({ error: 'Original activity is unavailable.' }, { status: 404 })
  }

  const { data: activity } = await supabase
    .from('activities')
    .select('id, user_id, completed_at')
    .eq('id', audit.activity_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!activity) {
    return NextResponse.json({ error: 'Original activity not found.' }, { status: 404 })
  }
  if (!activity.completed_at) {
    return NextResponse.json({ error: 'Lead is already active.' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error: activityError } = await supabase
    .from('activities')
    .update({
      completed_at: null,
      today_section_override: null,
      today_park_until: null,
    })
    .eq('id', activity.id)
    .eq('user_id', profile.org_id)

  if (activityError) {
    return NextResponse.json({ error: 'Failed to reinstate lead.' }, { status: 500 })
  }

  const { error: auditError } = await supabase
    .from('lost_lead_audit')
    .update({
      reinstated_at: nowIso,
      reinstated_by: profile.id,
      reinstate_reason: reason,
    })
    .eq('id', audit.id)
    .eq('org_id', profile.org_id)
    .is('reinstated_at', null)

  if (auditError) {
    await supabase
      .from('activities')
      .update({ completed_at: activity.completed_at })
      .eq('id', activity.id)
      .eq('user_id', profile.org_id)
    return NextResponse.json({ error: 'Failed to reinstate lead.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
