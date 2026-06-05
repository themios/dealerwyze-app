import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { ensureOrgSaasEmailAutoresponder } from '@/lib/sequences/ensureSaasEmailAutoresponder'
import { seedStarterSequences } from '@/lib/sequences/seedStarterSequences'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/sequences/seed-starters
 * Creates default starter campaigns for the org.
 * Safe to call multiple times — skips if org already has sequences.
 * Also called automatically on onboarding completion.
 */
export async function POST() {
  const profile = await requireProfile()
  const supabase = await createClient()

  await ensureOrgSaasEmailAutoresponder(profile.org_id, supabase)

  const { count } = await supabase
    .from('sequences')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .neq('slug', 'saas_email_nurture')

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Your account already has sequences. Add new ones from the sequences page.' },
      { status: 422 }
    )
  }

  const created = await seedStarterSequences(profile.org_id, supabase)
  return NextResponse.json({ ok: true, created })
}
