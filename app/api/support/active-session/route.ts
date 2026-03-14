import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

const TTL_READ_MS  = 2 * 60 * 60 * 1000   // 2h — read-only
const TTL_WRITE_MS = 30 * 60 * 1000        // 30min — write access

const END_ACTIONS = ['staff_impersonate_end', 'staff_session_ended_by_dealer']

/**
 * GET /api/support/active-session
 * Returns whether a platform staff member is currently viewing this org.
 * Used by both the dealer-side SupportSessionBanner and the admin ImpersonationBanner.
 */
export async function GET() {
  const profile = await requireProfile()
  const service = createServiceClient()

  const { data } = await service
    .from('admin_audit_log')
    .select('action, created_at')
    .eq('target_org_id', profile.org_id)
    .in('action', ['staff_impersonate_start', 'staff_remote_admin_start', ...END_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return NextResponse.json({ active: false })

  if (END_ACTIONS.includes(data.action)) return NextResponse.json({ active: false })

  const writeMode = data.action === 'staff_remote_admin_start'
  const ttlMs = writeMode ? TTL_WRITE_MS : TTL_READ_MS
  const ageMs = Date.now() - new Date(data.created_at).getTime()
  if (ageMs > ttlMs) return NextResponse.json({ active: false })

  return NextResponse.json({ active: true, write_mode: writeMode })
}

/**
 * DELETE /api/support/active-session
 * Dealer revokes an active support session. Logs to audit trail.
 * The admin's ImpersonationBanner polls this endpoint and auto-ends on their side.
 */
export async function DELETE() {
  const profile = await requireProfile()
  const service = createServiceClient()

  const { error } = await service.from('admin_audit_log').insert({
    admin_user_id: profile.id,
    target_org_id: profile.org_id,
    action: 'staff_session_ended_by_dealer',
    details: { ended_by_profile_id: profile.id },
  })

  if (error) {
    console.error('[support/active-session DELETE] audit insert failed:', error.message)
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
