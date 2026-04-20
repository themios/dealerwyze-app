/**
 * POST /api/onboarding/step
 * Saves onboarding wizard progress. Called after each step advance.
 * Body: { step: number } to update progress
 *       { complete: true } to mark onboarding done
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { seedStarterSequences } from '@/lib/sequences/seedStarterSequences'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const body: { step?: number; complete?: boolean } = await req.json()

  const updatePayload: Record<string, unknown> = {}

  if (body.complete) {
    updatePayload.onboarding_step = 5
    updatePayload.onboarding_completed_at = new Date().toISOString()
    // Auto-seed starter sequences so Automation settings picker is pre-populated.
    // Non-blocking — failure here must not block dashboard redirect.
    seedStarterSequences(profile.org_id).catch(() => {})
  } else if (typeof body.step === 'number' && body.step >= 0 && body.step <= 5) {
    updatePayload.onboarding_step = body.step
  } else {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
  }

  await supabase
    .from('org_settings')
    .update(updatePayload)
    .eq('org_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
