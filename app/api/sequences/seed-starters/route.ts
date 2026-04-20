import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { seedStarterSequences } from '@/lib/sequences/seedStarterSequences'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/sequences/seed-starters
 * Creates default starter campaigns for the org.
 * Safe to call multiple times — skips if org already has sequences.
 * Also called automatically on onboarding completion.
 */
export async function POST() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  // Check first so we can return a helpful message in the UI
  const { count } = await supabase
    .from('sequences')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Your account already has sequences. Add new ones from the sequences page.' },
      { status: 422 }
    )
  }

  const created = await seedStarterSequences(profile.org_id)
  return NextResponse.json({ ok: true, created })
}
