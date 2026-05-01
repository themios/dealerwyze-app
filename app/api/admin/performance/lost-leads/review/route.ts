import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'
import type { UserRole } from '@/types/index'

const bodySchema = z.object({
  auditId: z.string().uuid(),
})

/** Owner / manager only — reps must not clear low-confidence review flags. */
function canMarkRootCauseReviewed(role: UserRole): boolean {
  return isDealerAdmin(role) || role === 'dealer_manager'
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  if (!canMarkRootCauseReviewed(profile.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { auditId } = parsed.data

  const { error } = await supabase
    .from('lost_lead_audit')
    .update({ root_cause_needs_review: false })
    .eq('id', auditId)
    .eq('org_id', profile.org_id)
    .eq('root_cause_needs_review', true)

  if (error) {
    return NextResponse.json({ error: 'Failed to mark reviewed.' }, { status: 500 })
  }

  await supabase.from('ai_usage_log').insert({
    org_id: profile.org_id,
    event_type: 'root_cause_reviewed',
    tokens_in: 0,
    tokens_out: 0,
    model: 'deterministic',
  }).then(({ error: logErr }) => {
    if (logErr) console.warn('[lost-leads-review] usage log failed:', logErr.message)
  })

  return NextResponse.json({ ok: true })
}

