import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import {
  ensureAgentSaasEmailAutoresponder,
  ensureOrgSaasEmailAutoresponder,
} from '@/lib/sequences/ensureSaasEmailAutoresponder'

/**
 * POST /api/sequences/ensure-saas-email
 * Creates org-wide 15-email nurture (if missing) and the current user's personal copy.
 */
export async function POST() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const orgSequenceId = await ensureOrgSaasEmailAutoresponder(profile.org_id, supabase)
  const agentSequenceId = await ensureAgentSaasEmailAutoresponder(
    profile.org_id,
    profile.id,
    supabase,
  )

  return NextResponse.json({
    ok: true,
    org_sequence_id: orgSequenceId,
    agent_sequence_id: agentSequenceId,
    edit_url: agentSequenceId
      ? `/settings/sequences/${agentSequenceId}`
      : orgSequenceId
        ? `/settings/sequences/${orgSequenceId}`
        : null,
  })
}
