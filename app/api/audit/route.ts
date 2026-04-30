/**
 * GET /api/audit
 * Returns the org-level audit log for the authenticated dealer admin.
 * Scoped to their org only. Paginated with cursor (before_id).
 *
 * Query params:
 *   limit     — max rows, capped at 100 (default 50)
 *   before_id — cursor: return rows older than this id (UUID)
 *   action    — filter by action string (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can view the audit log.' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const rawLimit = Number(searchParams.get('limit') ?? '50')
  const limit = Math.min(Math.max(1, rawLimit), 100)
  const beforeId = searchParams.get('before_id') ?? null
  const action = searchParams.get('action') ?? null

  const supabase = await createClient()

  let query = supabase
    .from('org_audit_log')
    .select('id, actor_id, actor_type, action, details, ip, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (beforeId) {
    // Cursor: fetch rows where created_at < the row with before_id
    const { data: cursor } = await supabase
      .from('org_audit_log')
      .select('created_at')
      .eq('id', beforeId)
      .eq('org_id', profile.org_id)
      .maybeSingle()

    if (cursor?.created_at) {
      query = query.lt('created_at', cursor.created_at)
    }
  }

  if (action) {
    query = query.eq('action', action)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Could not load audit log.' }, { status: 500 })
  }

  return NextResponse.json({
    entries: data ?? [],
    has_more: (data?.length ?? 0) === limit,
  })
}
