/**
 * GET /api/audit — org-scoped audit trail.
 * Default: org_audit_log (dealer admin). ?source=security → Phase 5 audit_log (admin + manager).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getProfile, normalizeOwnerRole, type Profile } from '@/lib/auth/profile'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { canManageUsers, canViewDealerSecurityAudit } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clampAuditDaysParam, DEFAULT_AUDIT_DAYS } from '@/lib/audit/clampAuditDays'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

const SECURITY_ACTIONS = new Set([
  'impersonation_start',
  'impersonation_end',
  'payment_confirmed',
  'data_export',
  'settings_updated',
  'role_changed',
  'webhook_auth_failure',
  'gmail_oidc_invalid',
  'invalid_cron_secret',
  'root_cause_reviewed',
])

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const base = await getProfile()
  if (!base?.org_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (base.deactivated_at) {
    await (supabase as SupabaseClient).auth.signOut()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  const profile: Profile = staffSession?.orgId
    ? normalizeOwnerRole({ ...base, org_id: staffSession.orgId })
    : normalizeOwnerRole(base)

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') ?? ''
  const isSecurity = source === 'security'

  if (isSecurity) {
    if (!canViewDealerSecurityAudit(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (!canManageUsers(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let limit = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT
  limit = Math.min(MAX_LIMIT, limit)

  const days = clampAuditDaysParam(
    parseInt(searchParams.get('days') ?? '', 10),
    DEFAULT_AUDIT_DAYS,
  )

  const startMs = Date.now() - days * 24 * 60 * 60 * 1000
  const startIso = new Date(startMs).toISOString()

  const actionFilter = searchParams.get('action')?.trim() ?? ''
  const beforeId = searchParams.get('before_id')?.trim() ?? ''

  try {
    if (isSecurity) {
      if (actionFilter && actionFilter !== 'all' && !SECURITY_ACTIONS.has(actionFilter)) {
        return NextResponse.json({ error: 'Invalid action filter' }, { status: 400 })
      }

      let anchorCreated: string | null = null
      if (beforeId) {
        const { data: anchor, error: anchorErr } = await supabase
          .from('audit_log')
          .select('created_at')
          .eq('org_id', profile.org_id)
          .eq('id', beforeId)
          .maybeSingle()
        if (anchorErr) {
          console.error('[audit] security anchor:', anchorErr.message)
          return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
        }
        anchorCreated = anchor?.created_at ?? null
      }

      let q = supabase
        .from('audit_log')
        .select('id, actor_id, actor_type, action, entity_type, entity_id, metadata, ip_address, created_at')
        .eq('org_id', profile.org_id)
        .gte('created_at', startIso)

      if (actionFilter && actionFilter !== 'all') {
        q = q.eq('action', actionFilter)
      }
      if (anchorCreated) {
        q = q.lt('created_at', anchorCreated)
      }

      q = q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1)

      const { data: rows, error } = await q
      if (error) {
        console.error('[audit] security query:', error.message)
        return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
      }

      const list = rows ?? []
      const hasMore = list.length > limit
      const entries = hasMore ? list.slice(0, limit) : list
      const nextBeforeId = hasMore && entries.length > 0 ? entries[entries.length - 1].id : null

      return NextResponse.json({
        source: 'security',
        entries,
        next_before_id: nextBeforeId,
        has_more: hasMore,
      })
    }

    // Legacy org_audit_log (dealer admin)
    let anchorCreated: string | null = null
    if (beforeId) {
      const { data: anchor, error: anchorErr } = await supabase
        .from('org_audit_log')
        .select('created_at')
        .eq('org_id', profile.org_id)
        .eq('id', beforeId)
        .maybeSingle()
      if (anchorErr) {
        console.error('[audit] org anchor:', anchorErr.message)
        return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
      }
      anchorCreated = anchor?.created_at ?? null
    }

    let q = supabase
      .from('org_audit_log')
      .select('id, org_id, actor_id, actor_type, action, details, ip, created_at')
      .eq('org_id', profile.org_id)
      .gte('created_at', startIso)

    if (actionFilter && actionFilter !== 'all') {
      q = q.eq('action', actionFilter)
    }
    if (anchorCreated) {
      q = q.lt('created_at', anchorCreated)
    }

    q = q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    const { data: rows, error } = await q
    if (error) {
      console.error('[audit] org query:', error.message)
      return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
    }

    const list = rows ?? []
    const hasMore = list.length > limit
    const entries = hasMore ? list.slice(0, limit) : list
    const nextBeforeId = hasMore && entries.length > 0 ? entries[entries.length - 1].id : null

    return NextResponse.json({
      source: 'org',
      entries,
      next_before_id: nextBeforeId,
      has_more: hasMore,
    })
  } catch (e) {
    console.error('[audit] unexpected:', e)
    return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
  }
}
