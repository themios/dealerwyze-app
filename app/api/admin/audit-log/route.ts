import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformArea } from '@/lib/auth/platform'

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
