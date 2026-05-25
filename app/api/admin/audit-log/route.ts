import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'
import { getAdminVerticalScope } from '@/lib/admin/verticalScope'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'audit')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const search  = searchParams.get('q')?.trim() ?? ''
  const orgId   = searchParams.get('org_id')?.trim() ?? ''
  const adminId = searchParams.get('admin_id')?.trim() ?? ''
  const from    = searchParams.get('from')?.trim() ?? ''
  const to      = searchParams.get('to')?.trim() ?? ''
  const format  = searchParams.get('format')?.trim() ?? ''
  const limit   = Math.min(Number(searchParams.get('limit') ?? '100'), 500)

  const supabase = createServiceClient()
  const scope = await getAdminVerticalScope(req)

  let query = supabase
    .from('admin_audit_log')
    .select(`
      id,
      action,
      details,
      created_at,
      admin_user_id,
      target_org_id,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Scope to current vertical's orgs. On the dealer side also include entries with
  // no target_org (platform-level actions like staff creation). On the RE side,
  // only show RE org entries — platform entries are DW-context and not relevant.
  if (scope.isRE) {
    if (scope.orgIds.length > 0) {
      query = query.in('target_org_id', scope.orgIds)
    } else {
      return NextResponse.json([])
    }
  } else {
    // dealer: include null-org platform entries
    if (scope.orgIds.length > 0) {
      query = query.or(`target_org_id.in.(${scope.orgIds.join(',')}),target_org_id.is.null`)
    }
  }

  if (search)  query = query.ilike('action', `%${search}%`)
  if (orgId)   query = query.eq('target_org_id', orgId)
  if (adminId) query = query.eq('admin_user_id', adminId)
  if (from)    query = query.gte('created_at', new Date(from).toISOString())
  if (to) {
    const toDate = new Date(to)
    toDate.setDate(toDate.getDate() + 1)
    query = query.lt('created_at', toDate.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  if (format === 'csv') {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      'timestamp,action,org,admin_user_id,details',
      ...rows.map(e => [
        e.created_at,
        escape(e.action ?? ''),
        escape((e.organizations as { name?: string } | null)?.name ?? ''),
        e.admin_user_id ?? '',
        escape(JSON.stringify(e.details ?? {})),
      ].join(',')),
    ]
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    })
  }

  return NextResponse.json(rows)
}
